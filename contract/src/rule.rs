//! The payment rule. `release` and `preview` both call `decide`. Amounts are token units.

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Clause {
    pub buyer: String,
    pub vendor: String,
    pub recipient: String,
    pub amount: u128,
    pub evidence: [u8; 32],
    pub deadline_ns: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Deal {
    pub clause: Clause,
    pub buyer_signed: bool,
    pub vendor_signed: bool,
    pub funded: u128,
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
    NotLocked,
    Recipient,
    Amount,
    Evidence,
    AlreadyPaid,
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
            Code::NotLocked => "ERR_NOT_LOCKED",
            Code::Recipient => "ERR_RECIPIENT",
            Code::Amount => "ERR_AMOUNT",
            Code::Evidence => "ERR_EVIDENCE",
            Code::AlreadyPaid => "ERR_ALREADY_PAID",
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
        Self { clause, buyer_signed: false, vendor_signed: false, funded: 0, paid: 0, refunded: 0 }
    }

    pub fn both_signed(&self) -> bool {
        self.buyer_signed && self.vendor_signed
    }

    pub fn locked(&self) -> bool {
        self.both_signed() && self.funded == self.clause.amount && self.paid == 0 && self.refunded == 0
    }
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
    if !deal.locked() {
        return Err(Code::NotLocked);
    }
    if now_ns >= deal.clause.deadline_ns {
        return Err(Code::TooLate);
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
    Ok(())
}

pub fn release(deal: &mut Deal, recipient: &str, amount: u128, evidence: &[u8; 32], now_ns: u64) -> Result<u128, Code> {
    decide(deal, recipient, amount, evidence, now_ns)?;
    deal.paid = amount;
    Ok(amount)
}

pub fn refund(deal: &mut Deal, now_ns: u64) -> Result<u128, Code> {
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
    deal.refunded = amount;
    Ok(amount)
}

pub fn conserved(deal: &Deal) -> bool {
    deal.paid + deal.refunded <= deal.funded && deal.funded <= deal.clause.amount
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
    fn pays_the_signed_slip_once() {
        let mut d = ready();
        assert_eq!(release(&mut d, "sable.testnet", 48_000_000, &evidence(1), 500).unwrap(), 48_000_000);
        assert_eq!(release(&mut d, "sable.testnet", 48_000_000, &evidence(1), 500), Err(Code::AlreadyPaid));
        assert!(conserved(&d));
        assert_eq!(d.paid, 48_000_000);
    }

    #[test]
    fn wrong_recipient_amount_and_evidence_pay_nothing() {
        let d = ready();
        assert_eq!(decide(&d, "other.testnet", 48_000_000, &evidence(1), 500), Err(Code::Recipient));
        assert_eq!(decide(&d, "sable.testnet", 80_000_000, &evidence(1), 500), Err(Code::Amount));
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(2), 500), Err(Code::Evidence));
        assert_eq!(d.paid, 0);
    }

    #[test]
    fn deadline_blocks_release_and_returns_the_balance() {
        let mut d = ready();
        assert_eq!(refund(&mut d, 999), Err(Code::TooEarly));
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(1), 1_000), Err(Code::TooLate));
        assert_eq!(refund(&mut d, 1_000).unwrap(), 48_000_000);
        assert_eq!(d.refunded, 48_000_000);
        assert_eq!(d.paid, 0);
        assert!(conserved(&d));
    }

    #[test]
    fn extra_deposit_is_not_kept() {
        let mut d = deal();
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
}
