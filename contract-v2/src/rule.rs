//! The v2 payment rule. Amounts are token base units. `Paid` is not set here until
//! `finish_release` sees a successful transfer. No method in this module moves `not_before_ns`.

use sha2::{Digest, Sha256};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Clause {
    pub buyer: String,
    pub vendor: String,
    pub recipient: String,
    pub amount: u128,
    pub evidence: [u8; 32],
    pub not_before_ns: u64,
    pub deadline_ns: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Deal {
    pub clause: Clause,
    pub buyer_signed: bool,
    pub vendor_signed: bool,
    pub funded: u128,
    pub releasing: bool,
    pub refunding: bool,
    pub paid: u128,
    pub refunded: u128,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Code {
    Ok,
    NotParty,
    AlreadySigned,
    NeedBoth,
    NotBuyer,
    BadAmount,
    BadWindow,
    NotLocked,
    Recipient,
    Amount,
    Evidence,
    NotYet,
    AlreadyPaid,
    Busy,
    TooEarly,
    TooLate,
    Nothing,
}

impl Code {
    pub fn as_str(self) -> &'static str {
        match self {
            Code::Ok => "OK",
            Code::NotParty => "ERR_NOT_PARTY",
            Code::AlreadySigned => "ERR_ALREADY_SIGNED",
            Code::NeedBoth => "ERR_NEED_BOTH",
            Code::NotBuyer => "ERR_NOT_BUYER",
            Code::BadAmount => "ERR_BAD_AMOUNT",
            Code::BadWindow => "ERR_BAD_WINDOW",
            Code::NotLocked => "ERR_NOT_LOCKED",
            Code::Recipient => "ERR_RECIPIENT",
            Code::Amount => "ERR_AMOUNT",
            Code::Evidence => "ERR_EVIDENCE",
            Code::NotYet => "ERR_NOT_YET",
            Code::AlreadyPaid => "ERR_ALREADY_PAID",
            Code::Busy => "ERR_BUSY",
            Code::TooEarly => "ERR_TOO_EARLY",
            Code::TooLate => "ERR_TOO_LATE",
            Code::Nothing => "ERR_NOTHING",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Who {
    Buyer,
    Vendor,
}

impl Deal {
    pub fn open(clause: Clause) -> Self {
        Self {
            clause,
            buyer_signed: false,
            vendor_signed: false,
            funded: 0,
            releasing: false,
            refunding: false,
            paid: 0,
            refunded: 0,
        }
    }

    pub fn both_signed(&self) -> bool {
        self.buyer_signed && self.vendor_signed
    }

    pub fn locked(&self) -> bool {
        self.both_signed() && self.funded == self.clause.amount && self.paid == 0 && self.refunded == 0
    }
}

/// `not_before` must be after the open block and strictly before the deadline.
pub fn check_window(now_ns: u64, not_before_ns: u64, deadline_ns: u64) -> Result<(), Code> {
    if not_before_ns <= now_ns || not_before_ns >= deadline_ns {
        return Err(Code::BadWindow);
    }
    Ok(())
}

pub fn sign(deal: &mut Deal, who: Who) -> Result<(), Code> {
    let slot = match who {
        Who::Buyer => &mut deal.buyer_signed,
        Who::Vendor => &mut deal.vendor_signed,
    };
    if *slot {
        return Err(Code::AlreadySigned);
    }
    *slot = true;
    Ok(())
}

/// Credits at most the clause amount. Returns the unused part the token must send back.
/// This does not read the clock. A deposit after the deadline is still kept.
pub fn fund(deal: &mut Deal, sender_is_buyer: bool, amount: u128) -> Result<u128, Code> {
    if !deal.both_signed() {
        return Err(Code::NeedBoth);
    }
    if !sender_is_buyer {
        return Err(Code::NotBuyer);
    }
    if deal.paid > 0 || deal.refunded > 0 {
        return Err(Code::AlreadyPaid);
    }
    let room = deal.clause.amount.saturating_sub(deal.funded);
    if room == 0 {
        return Ok(amount);
    }
    let take = amount.min(room);
    deal.funded += take;
    Ok(amount - take)
}

pub fn decide(deal: &Deal, recipient: &str, amount: u128, evidence: &[u8; 32], now_ns: u64) -> Result<(), Code> {
    if deal.paid > 0 || deal.refunded > 0 {
        return Err(Code::AlreadyPaid);
    }
    if deal.releasing || deal.refunding {
        return Err(Code::Busy);
    }
    if !deal.locked() {
        return Err(Code::NotLocked);
    }
    if recipient != deal.clause.recipient {
        return Err(Code::Recipient);
    }
    if amount != deal.clause.amount {
        return Err(Code::Amount);
    }
    if evidence != &deal.clause.evidence {
        return Err(Code::Evidence);
    }
    if now_ns < deal.clause.not_before_ns {
        return Err(Code::NotYet);
    }
    if now_ns >= deal.clause.deadline_ns {
        return Err(Code::TooLate);
    }
    Ok(())
}

/// Marks the transfer in flight. Does not mark the meter paid.
pub fn begin_release(deal: &mut Deal, recipient: &str, amount: u128, evidence: &[u8; 32], now_ns: u64) -> Result<u128, Code> {
    decide(deal, recipient, amount, evidence, now_ns)?;
    deal.releasing = true;
    Ok(deal.clause.amount)
}

pub fn finish_release(deal: &mut Deal, succeeded: bool) {
    if !deal.releasing {
        return;
    }
    deal.releasing = false;
    if succeeded {
        deal.paid = deal.clause.amount;
    }
}

pub fn begin_refund(deal: &mut Deal, now_ns: u64) -> Result<u128, Code> {
    if deal.releasing || deal.refunding {
        return Err(Code::Busy);
    }
    if deal.paid > 0 || deal.refunded > 0 {
        return Err(Code::AlreadyPaid);
    }
    if !deal.both_signed() || deal.funded == 0 {
        return Err(Code::NotLocked);
    }
    if now_ns < deal.clause.deadline_ns {
        return Err(Code::TooEarly);
    }
    let amount = deal.funded;
    deal.refunding = true;
    Ok(amount)
}

pub fn finish_refund(deal: &mut Deal, succeeded: bool) {
    if !deal.refunding {
        return;
    }
    deal.refunding = false;
    if succeeded {
        deal.refunded = deal.funded;
    }
}

pub fn conserved(deal: &Deal) -> bool {
    deal.paid + deal.refunded <= deal.funded && deal.funded <= deal.clause.amount && !(deal.paid > 0 && deal.refunded > 0)
}

fn push_field(out: &mut Vec<u8>, field: &[u8]) {
    let len = u32::try_from(field.len()).unwrap_or(u32::MAX);
    out.extend_from_slice(&len.to_be_bytes());
    out.extend_from_slice(field);
}

/// Length-prefixed fields. The amount is the decimal integer of base units, never `48.00`.
pub fn line_bytes(
    contract: &str,
    meter_id: u64,
    token: &str,
    recipient: &str,
    amount: u128,
    not_before_ns: u64,
    deadline_ns: u64,
    evidence_hex: &str,
) -> Vec<u8> {
    let mut out = Vec::new();
    for field in [
        "meter/v2".to_string(),
        contract.to_string(),
        meter_id.to_string(),
        token.to_string(),
        recipient.to_string(),
        amount.to_string(),
        not_before_ns.to_string(),
        deadline_ns.to_string(),
        evidence_hex.to_string(),
    ] {
        push_field(&mut out, field.as_bytes());
    }
    out
}

pub fn line_hash_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn evidence(byte: u8) -> [u8; 32] {
        let mut e = [0u8; 32];
        e[0] = byte;
        e
    }

    fn deal() -> Deal {
        Deal::open(Clause {
            buyer: "marlow.testnet".into(),
            vendor: "sable.testnet".into(),
            recipient: "sable.testnet".into(),
            amount: 48_000_000,
            evidence: evidence(1),
            not_before_ns: 100,
            deadline_ns: 1_000,
        })
    }

    fn ready() -> Deal {
        let mut d = deal();
        sign(&mut d, Who::Buyer).unwrap();
        sign(&mut d, Who::Vendor).unwrap();
        assert_eq!(fund(&mut d, true, 48_000_000).unwrap(), 0);
        d
    }

    #[test]
    fn a_window_already_open_or_empty_is_rejected() {
        assert_eq!(check_window(100, 100, 1_000), Err(Code::BadWindow));
        assert_eq!(check_window(50, 40, 1_000), Err(Code::BadWindow));
        assert_eq!(check_window(50, 1_000, 1_000), Err(Code::BadWindow));
        assert_eq!(check_window(50, 1_001, 1_000), Err(Code::BadWindow));
        assert_eq!(check_window(50, 100, 1_000), Ok(()));
    }

    #[test]
    fn release_before_the_stored_time_moves_nothing() {
        let d = ready();
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(1), 99), Err(Code::NotYet));
        assert!(!d.releasing);
        assert_eq!(d.paid, 0);
    }

    #[test]
    fn a_failed_transfer_is_not_paid_and_a_success_pays_once() {
        let mut d = ready();
        assert_eq!(begin_release(&mut d, "sable.testnet", 48_000_000, &evidence(1), 100).unwrap(), 48_000_000);
        assert!(d.releasing);
        assert_eq!(d.paid, 0);
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(1), 100), Err(Code::Busy));
        finish_release(&mut d, false);
        assert!(!d.releasing);
        assert_eq!(d.paid, 0);
        begin_release(&mut d, "sable.testnet", 48_000_000, &evidence(1), 999).unwrap();
        finish_release(&mut d, true);
        assert_eq!(d.paid, 48_000_000);
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(1), 999), Err(Code::AlreadyPaid));
        assert!(conserved(&d));
    }

    #[test]
    fn one_nanosecond_before_the_deadline_clears_and_the_deadline_does_not() {
        let d = ready();
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(1), 999), Ok(()));
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(1), 1_000), Err(Code::TooLate));
    }

    #[test]
    fn wrong_recipient_amount_and_evidence_pay_nothing() {
        let d = ready();
        assert_eq!(decide(&d, "other.testnet", 48_000_000, &evidence(1), 99), Err(Code::Recipient));
        assert_eq!(decide(&d, "sable.testnet", 80_000_000, &evidence(1), 500), Err(Code::Amount));
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(2), 500), Err(Code::Evidence));
        assert_eq!(d.paid, 0);
    }

    #[test]
    fn deadline_blocks_release_and_a_failed_refund_can_be_retried() {
        let mut d = ready();
        assert_eq!(begin_refund(&mut d, 999), Err(Code::TooEarly));
        assert_eq!(begin_refund(&mut d, 1_000).unwrap(), 48_000_000);
        assert!(d.refunding);
        assert_eq!(d.refunded, 0);
        assert_eq!(begin_release(&mut d, "sable.testnet", 48_000_000, &evidence(1), 1_000), Err(Code::Busy));
        finish_refund(&mut d, false);
        assert_eq!(d.refunded, 0);
        assert_eq!(begin_refund(&mut d, 1_000).unwrap(), 48_000_000);
        finish_refund(&mut d, true);
        assert_eq!(d.refunded, 48_000_000);
        assert_eq!(d.paid, 0);
        assert_eq!(begin_refund(&mut d, 1_001), Err(Code::AlreadyPaid));
        assert!(conserved(&d));
    }

    #[test]
    fn extra_deposit_is_not_kept_and_the_clock_is_not_read() {
        let mut d = deal();
        d.clause.deadline_ns = 1;
        sign(&mut d, Who::Buyer).unwrap();
        sign(&mut d, Who::Vendor).unwrap();
        assert_eq!(fund(&mut d, true, 60_000_000).unwrap(), 12_000_000);
        assert_eq!(d.funded, 48_000_000);
    }

    #[test]
    fn a_stranger_and_a_second_signature_do_not_open_the_escrow() {
        let mut d = deal();
        assert_eq!(fund(&mut d, true, 1), Err(Code::NeedBoth));
        sign(&mut d, Who::Buyer).unwrap();
        assert_eq!(sign(&mut d, Who::Buyer), Err(Code::AlreadySigned));
        sign(&mut d, Who::Vendor).unwrap();
        assert_eq!(fund(&mut d, false, 48_000_000), Err(Code::NotBuyer));
    }

    #[test]
    fn the_line_hash_uses_integer_units_and_a_fixed_vector() {
        let evidence = "ab".repeat(32);
        let bytes = line_bytes(
            "m.example.testnet",
            1,
            "token.example.testnet",
            "sable.testnet",
            48_000_000,
            100,
            1_000,
            &evidence,
        );
        let text = String::from_utf8(bytes.clone()).unwrap();
        assert!(text.contains("48000000"));
        assert!(!text.contains("48.00"));
        assert_eq!(line_hash_hex(&bytes), "ef94b445cac1c1ab3b81d1c0cfac8e6017df89a1ce571540fc61cfb5ffc24d8d");
    }
}
