//! Pool and condition checks. Compiled for `cargo test` only. They are not methods
//! on the deployed contract, and `lib.rs` does not call them.

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};

#[derive(Clone)]
pub struct Share {
    pub account: String,
    pub share: u128,
    pub deposited: u128,
    pub refunded: u128,
}

pub struct Pot {
    pub deadline_ns: u64,
    pub shares: Vec<Share>,
    pub paid: bool,
}

pub fn deposit(pot: &mut Pot, sender: &str, amount: u128, now_ns: u64) -> Result<u128, &'static str> {
    if now_ns >= pot.deadline_ns {
        return Err("ERR_TOO_LATE");
    }
    let Some(member) = pot.shares.iter_mut().find(|share| share.account == sender) else {
        return Err("ERR_NOT_MEMBER");
    };
    if member.deposited > 0 {
        return Err("ERR_ALREADY_DEPOSITED");
    }
    if amount != member.share {
        return Err("ERR_SHARE");
    }
    member.deposited = amount;
    Ok(0)
}

pub fn all_funded(pot: &Pot) -> bool {
    pot.shares.iter().all(|share| share.deposited == share.share)
}

pub fn refund_members(pot: &mut Pot, now_ns: u64) -> Result<Vec<(String, u128)>, &'static str> {
    if pot.paid {
        return Err("ERR_ALREADY_PAID");
    }
    if now_ns < pot.deadline_ns {
        return Err("ERR_TOO_EARLY");
    }
    let mut out = Vec::new();
    for member in &mut pot.shares {
        if member.refunded > 0 || member.deposited == 0 {
            continue;
        }
        member.refunded = member.deposited;
        out.push((member.account.clone(), member.deposited));
    }
    Ok(out)
}

pub fn condition_message(line_hash: &str, result_hash: &str) -> String {
    format!("meter/v3 condition {line_hash} {result_hash}")
}

pub fn verify_condition(line_hash: &str, result_hash: &str, pinned: &[u8; 32], signature: &[u8; 64]) -> Result<(), &'static str> {
    let key = VerifyingKey::from_bytes(pinned).map_err(|_| "ERR_CONDITION")?;
    let signature = Signature::from_bytes(signature);
    key.verify(condition_message(line_hash, result_hash).as_bytes(), &signature).map_err(|_| "ERR_CONDITION")
}

fn pot() -> Pot {
    Pot {
        deadline_ns: 1_000,
        paid: false,
        shares: vec![
            Share { account: "a.testnet".into(), share: 30_000_000, deposited: 0, refunded: 0 },
            Share { account: "b.testnet".into(), share: 18_000_000, deposited: 0, refunded: 0 },
        ],
    }
}

#[test]
fn each_member_deposits_exactly_their_share() {
    let mut pool = pot();
    assert_eq!(deposit(&mut pool, "a.testnet", 30_000_000, 50), Ok(0));
    assert_eq!(deposit(&mut pool, "b.testnet", 18_000_000, 50), Ok(0));
    assert!(all_funded(&pool));
}

#[test]
fn a_wrong_share_a_stranger_and_a_second_deposit_are_rejected() {
    let mut pool = pot();
    assert_eq!(deposit(&mut pool, "a.testnet", 29_000_000, 50), Err("ERR_SHARE"));
    assert_eq!(deposit(&mut pool, "c.testnet", 30_000_000, 50), Err("ERR_NOT_MEMBER"));
    deposit(&mut pool, "a.testnet", 30_000_000, 50).unwrap();
    assert_eq!(deposit(&mut pool, "a.testnet", 30_000_000, 50), Err("ERR_ALREADY_DEPOSITED"));
    assert!(!all_funded(&pool));
}

#[test]
fn one_short_member_sends_the_others_their_own_deposit_back() {
    let mut pool = pot();
    deposit(&mut pool, "a.testnet", 30_000_000, 50).unwrap();
    assert!(!all_funded(&pool));
    assert_eq!(refund_members(&mut pool, 999), Err("ERR_TOO_EARLY"));
    let returned = refund_members(&mut pool, 1_000).unwrap();
    assert_eq!(returned, vec![("a.testnet".into(), 30_000_000)]);
    assert_eq!(pool.shares[1].refunded, 0);
    assert!(refund_members(&mut pool, 1_001).unwrap().is_empty());
}

#[test]
fn a_condition_proof_must_use_the_pinned_key_and_the_stored_result() {
    let secret = [7u8; 32];
    let signing = SigningKey::from_bytes(&secret);
    let pinned = signing.verifying_key().to_bytes();
    let line = "1b1cb8f6af3e2644bfacb7c21d6a6273e51beb87807b0b65e1a5cb6d3ebb9965";
    let result = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let signature: [u8; 64] = signing.sign(condition_message(line, result).as_bytes()).to_bytes();
    assert!(verify_condition(line, result, &pinned, &signature).is_ok());
    let other = [8u8; 32];
    assert_eq!(verify_condition(line, result, &other, &signature), Err("ERR_CONDITION"));
    let other_result = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    assert_eq!(verify_condition(line, other_result, &pinned, &signature), Err("ERR_CONDITION"));
}
