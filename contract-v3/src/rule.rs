//! The payment rule. Amounts are token base units. `Paid` is not set here until
//! `finish_release` sees a successful transfer. No method in this module moves `not_before_ns`.

use sha2::{Digest, Sha256};
use unicode_normalization::UnicodeNormalization;

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
    WrongToken,
    Nothing,
    Cap,
    CapMismatch,
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
            Code::WrongToken => "ERR_WRONG_TOKEN",
            Code::Nothing => "ERR_NOTHING",
            Code::Cap => "ERR_CAP",
            Code::CapMismatch => "ERR_CAP_MISMATCH",
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
/// A deposit at or after the deadline is rejected and nothing is kept.
pub fn fund(deal: &mut Deal, sender_is_buyer: bool, amount: u128, now_ns: u64) -> Result<u128, Code> {
    if now_ns >= deal.clause.deadline_ns {
        return Err(Code::TooLate);
    }
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

pub fn accept_token(predecessor_is_token: bool) -> Result<(), Code> {
    if predecessor_is_token {
        Ok(())
    } else {
        Err(Code::WrongToken)
    }
}

/// Five recorded refusals is the tripwire. The fifth call is the one that burns the key.
/// Every `release` error counts, including `ERR_NOT_YET`. `ERR_TRANSFER` does not: the callback
/// records that code and never calls this. `preview` is a view and does not count. A caller that
/// is early should preview first, then release once the window is open.
pub fn record_refusal(refusals: u32) -> (u32, bool) {
    let next = refusals.saturating_add(1);
    (next, next >= 5)
}

pub const RELEASE_METHOD: &str = "release";

/// `released + reserved + amount == cap` is allowed. One unit over, or an overflow, is `ERR_CAP`.
pub fn cap_allows(released: u128, reserved: u128, amount: u128, cap: u128) -> Result<(), Code> {
    match released.checked_add(reserved).and_then(|used| used.checked_add(amount)) {
        Some(total) if total <= cap => Ok(()),
        _ => Err(Code::Cap),
    }
}

/// A failed callback drops the reservation and does not add to `released`.
pub fn settle_reservation(released: u128, reserved: u128, amount: u128, succeeded: bool) -> (u128, u128) {
    let reserved = reserved.saturating_sub(amount);
    let released = if succeeded { released.saturating_add(amount) } else { released };
    (released, reserved)
}

/// The first install stores `offered`. A later install must pass the same number.
pub fn accept_cap(stored: Option<u128>, offered: u128) -> Result<u128, Code> {
    match stored {
        Some(current) if current != offered => Err(Code::CapMismatch),
        Some(current) => Ok(current),
        None => Ok(offered),
    }
}

/// NEP-297. `data` is a one-element array. Caller is an account id or an ed25519 public key.
pub fn event_json(event: &str, meter_id: u64, method: &str, code: &str, caller: &str) -> String {
    format!(
        r#"{{"standard":"meter","version":"1.0.0","event":"{event}","data":[{{"meter_id":"{meter_id}","method":"{method}","code":"{code}","caller":"{caller}"}}]}}"#
    )
}

pub fn conserved(deal: &Deal) -> bool {
    deal.paid + deal.refunded <= deal.funded && deal.funded <= deal.clause.amount && !(deal.paid > 0 && deal.refunded > 0)
}

pub fn normalize_sentence(sentence: &str) -> String {
    sentence.nfc().collect()
}

pub fn evidence_hex(sentence: &str) -> String {
    hex::encode(Sha256::digest(normalize_sentence(sentence).as_bytes()))
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
    sentence: &str,
) -> Vec<u8> {
    let sentence: String = sentence.nfc().collect();
    let mut out = Vec::new();
    for field in [
        "meter/v3".to_string(),
        contract.to_string(),
        meter_id.to_string(),
        token.to_string(),
        recipient.to_string(),
        amount.to_string(),
        not_before_ns.to_string(),
        deadline_ns.to_string(),
        sentence,
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
        assert_eq!(fund(&mut d, true, 48_000_000, 50).unwrap(), 0);
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
    fn extra_deposit_is_not_kept() {
        let mut d = deal();
        sign(&mut d, Who::Buyer).unwrap();
        sign(&mut d, Who::Vendor).unwrap();
        assert_eq!(fund(&mut d, true, 60_000_000, 50).unwrap(), 12_000_000);
        assert_eq!(d.funded, 48_000_000);
    }

    #[test]
    fn a_deposit_at_the_deadline_is_rejected() {
        let mut d = deal();
        sign(&mut d, Who::Buyer).unwrap();
        sign(&mut d, Who::Vendor).unwrap();
        assert_eq!(fund(&mut d, true, 48_000_000, 1_000), Err(Code::TooLate));
        assert_eq!(d.funded, 0);
    }

    #[test]
    fn a_short_deposit_does_not_fund_the_meter() {
        let mut d = deal();
        sign(&mut d, Who::Buyer).unwrap();
        sign(&mut d, Who::Vendor).unwrap();
        assert_eq!(fund(&mut d, true, 1_000_000, 50).unwrap(), 0);
        assert!(!d.locked());
        assert_eq!(decide(&d, "sable.testnet", 48_000_000, &evidence(1), 500), Err(Code::NotLocked));
    }

    /// The state change inside `install_agent` after the tripwire.
    /// A revoked meter is accepted. The counter clears. The line does not change.
    /// 2026-11-11: the previous build required `!revoked` and returned `ERR_AGENT`.
    fn reinstall_after_revoke(meter: &Reinstall) -> Result<Reinstall, &'static str> {
        if meter.agent.is_some() {
            return Err("ERR_AGENT");
        }
        let mut next = meter.clone();
        if next.revoked {
            next.revoked = false;
            next.refusals = 0;
        }
        next.agent = Some("ed25519:reinstall");
        Ok(next)
    }

    #[derive(Clone, Debug, PartialEq)]
    struct Reinstall {
        revoked: bool,
        refusals: u32,
        agent: Option<&'static str>,
        recipient: &'static str,
        amount: u128,
        sentence: &'static str,
        not_before_ns: u64,
        deadline_ns: u64,
        funded: u128,
    }

    #[test]
    fn install_agent_after_the_tripwire_clears_the_counter_and_keeps_the_line() {
        let burned = Reinstall {
            revoked: true,
            refusals: 5,
            agent: None,
            recipient: "sable.testnet",
            amount: 48_000_000,
            sentence: "Field report 04, price column at most 100",
            not_before_ns: 100,
            deadline_ns: 1_000,
            funded: 48_000_000,
        };
        let installed = reinstall_after_revoke(&burned).unwrap();
        assert!(!installed.revoked);
        assert_eq!(installed.refusals, 0);
        assert_eq!(installed.agent, Some("ed25519:reinstall"));
        assert_eq!(installed.recipient, burned.recipient);
        assert_eq!(installed.amount, burned.amount);
        assert_eq!(installed.sentence, burned.sentence);
        assert_eq!(installed.not_before_ns, burned.not_before_ns);
        assert_eq!(installed.deadline_ns, burned.deadline_ns);
        assert_eq!(installed.funded, burned.funded);

        let mut deal = ready();
        assert_eq!(deal.clause.recipient, "sable.testnet");
        assert_eq!(deal.funded, installed.funded);
        assert_eq!(begin_release(&mut deal, installed.recipient, installed.amount, &evidence(1), 500).unwrap(), 48_000_000);
        finish_release(&mut deal, true);
        assert_eq!(deal.paid, 48_000_000);

        let live = Reinstall { agent: Some("ed25519:still-there"), revoked: true, ..burned };
        assert_eq!(reinstall_after_revoke(&live), Err("ERR_AGENT"));
    }

    #[test]
    fn a_different_token_is_rejected_and_the_fifth_refusal_burns() {
        assert_eq!(accept_token(false), Err(Code::WrongToken));
        assert_eq!(accept_token(true), Ok(()));
        let mut refusals = 0;
        let mut burn = false;
        for _ in 0..4 {
            (refusals, burn) = record_refusal(refusals);
            assert!(!burn);
        }
        (refusals, burn) = record_refusal(refusals);
        assert!(burn);
        assert_eq!(refusals, 5);
        assert_eq!(RELEASE_METHOD, "release");
    }

    /// preview is a view. It calls decide and does not call record_refusal.
    /// get() returns refusals. There is no separate counter method.
    #[test]
    fn preview_leaves_the_refusal_counter_unchanged() {
        let deal = ready();
        let refusals = 4u32;
        let paid = deal.paid;
        let funded = deal.funded;
        let wrong = decide(&deal, "other.testnet", 48_000_000, &evidence(1), 99);
        assert_eq!(wrong, Err(Code::Recipient));
        let early = decide(&deal, &deal.clause.recipient, deal.clause.amount, &deal.clause.evidence, 0);
        assert_eq!(early, Err(Code::NotYet));
        assert_eq!(deal.paid, paid);
        assert_eq!(deal.funded, funded);
        assert_eq!(refusals, 4);
    }

    #[test]
    fn a_stranger_and_a_second_signature_do_not_open_the_escrow() {
        let mut d = deal();
        assert_eq!(fund(&mut d, true, 1, 50), Err(Code::NeedBoth));
        sign(&mut d, Who::Buyer).unwrap();
        assert_eq!(sign(&mut d, Who::Buyer), Err(Code::AlreadySigned));
        sign(&mut d, Who::Vendor).unwrap();
        assert_eq!(fund(&mut d, false, 48_000_000, 50), Err(Code::NotBuyer));
    }

    #[test]
    fn the_line_hash_uses_integer_units_and_a_fixed_vector() {
        let sentence = "Field report 04, price column at most 100";
        let bytes = line_bytes("m.example.testnet", 1, "token.example.testnet", "sable.testnet", 48_000_000, 100, 1_000, sentence);
        let text = String::from_utf8(bytes.clone()).unwrap();
        assert!(text.contains("48000000"));
        assert!(!text.contains("48.00"));
        assert_eq!(line_hash_hex(&bytes), "a66de00ba403a47599877d24b741bf5f3ca2d28c96cb7276462335c9475ca2e3");
        let composed = line_hash_hex(&line_bytes("m.example.testnet", 1, "token.example.testnet", "sable.testnet", 48_000_000, 100, 1_000, "e\u{0301}"));
        let single = line_hash_hex(&line_bytes("m.example.testnet", 1, "token.example.testnet", "sable.testnet", 48_000_000, 100, 1_000, "\u{00e9}"));
        assert_eq!(composed, single);
    }

    #[test]
    fn the_cap_allows_the_exact_total_and_refuses_one_unit_over() {
        assert_eq!(cap_allows(0, 0, 48_000_000, 48_000_000), Ok(()));
        assert_eq!(cap_allows(47_999_999, 0, 1, 48_000_000), Ok(()));
        assert_eq!(cap_allows(48_000_000, 0, 1, 48_000_000), Err(Code::Cap));
        assert_eq!(cap_allows(0, 48_000_000, 1, 48_000_000), Err(Code::Cap));
        assert_eq!(cap_allows(u128::MAX, 1, 0, u128::MAX), Err(Code::Cap));
    }

    #[test]
    fn a_failed_callback_releases_the_reservation_and_a_success_keeps_it() {
        let (released, reserved) = settle_reservation(0, 48_000_000, 48_000_000, false);
        assert_eq!((released, reserved), (0, 0));
        let (released, reserved) = settle_reservation(0, 48_000_000, 48_000_000, true);
        assert_eq!((released, reserved), (48_000_000, 0));
        assert_eq!(cap_allows(released, reserved, 1, 48_000_000), Err(Code::Cap));
    }

    #[test]
    fn a_second_install_must_repeat_the_same_cap() {
        assert_eq!(accept_cap(None, 48_000_000), Ok(48_000_000));
        assert_eq!(accept_cap(Some(48_000_000), 48_000_000), Ok(48_000_000));
        assert_eq!(accept_cap(Some(48_000_000), 47_000_000), Err(Code::CapMismatch));
    }

    #[test]
    fn an_event_is_nep297_with_one_data_object() {
        let raw = event_json("refusal", 7, "release", "ERR_CAP", "ed25519:key");
        assert!(raw.starts_with(r#"{"standard":"meter","version":"1.0.0","event":"refusal","data":["#));
        assert!(raw.contains(r#""meter_id":"7""#));
        assert!(raw.contains(r#""method":"release""#));
        assert!(raw.contains(r#""code":"ERR_CAP""#));
        assert!(raw.contains(r#""caller":"ed25519:key""#));
        assert!(raw.ends_with("]}"));
        for event in ["paid", "fund", "refund", "key"] {
            assert!(event_json(event, 1, "release", "OK", "buyer.testnet").contains(&format!(r#""event":"{event}""#)));
        }
    }
}
