//! Contract-level checks. The payment rule itself is covered in `rule.rs`.
//! A panicked receipt on NEAR drops its logs. These tests assert the panic and that no
//! `EVENT_JSON` line was written. The unit-test mock still keeps the panic payload.

use super::rule::evidence_hex;
use super::*;
use near_sdk::json_types::{U128, U64};
use near_sdk::test_utils::{get_logs, testing_env_with_promise_results, VMContextBuilder};
use near_sdk::{testing_env, AccountId, NearToken, PromiseOrValue, PromiseResult, PublicKey};
use std::panic::{catch_unwind, AssertUnwindSafe};

const SENTENCE: &str = "Field report 04, price column at most 100";
const AMOUNT: u128 = 48_000_000;
const KEY_A: &str = "ed25519:HhYArGqrbP2wqMvF13CcrRzzxqGtq1bHnUwQt4bvMBZC";

fn account(name: &str) -> AccountId {
    name.parse().unwrap()
}

fn key_a() -> PublicKey {
    KEY_A.parse().unwrap()
}

fn reset() {
    near_sdk::mock::with_mocked_blockchain(|chain| {
        let _ = chain.take_storage();
    });
}

fn ctx(predecessor: &str, public_key: PublicKey, now: u64, yocto: u128) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("meter.testnet"))
        .predecessor_account_id(account(predecessor))
        .signer_account_id(account(predecessor))
        .signer_account_pk(public_key)
        .block_timestamp(now)
        .attached_deposit(NearToken::from_yoctonear(yocto));
    testing_env!(builder.build());
}

fn callback(now: u64, result: PromiseResult) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("meter.testnet"))
        .predecessor_account_id(account("meter.testnet"))
        .signer_account_id(account("meter.testnet"))
        .block_timestamp(now);
    #[allow(deprecated)]
    testing_env_with_promise_results(builder.build(), result);
}

fn on_token(predecessor: &str, yocto: u128) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("token.testnet"))
        .predecessor_account_id(account(predecessor))
        .signer_account_id(account(predecessor))
        .signer_account_pk(key_a())
        .block_timestamp(50)
        .attached_deposit(NearToken::from_yoctonear(yocto));
    testing_env!(builder.build());
}

fn token_callback(result: PromiseResult) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("token.testnet"))
        .predecessor_account_id(account("token.testnet"))
        .signer_account_id(account("token.testnet"))
        .block_timestamp(50);
    #[allow(deprecated)]
    testing_env_with_promise_results(builder.build(), result);
}

fn value(result: PromiseOrValue<String>) -> String {
    match result {
        PromiseOrValue::Value(text) => text,
        PromiseOrValue::Promise(_) => panic!("expected a code, got a transfer"),
    }
}

fn promise(result: PromiseOrValue<String>) {
    match result {
        PromiseOrValue::Promise(_) => {}
        PromiseOrValue::Value(text) => panic!("expected a transfer, got {text}"),
    }
}

fn events() -> Vec<String> {
    get_logs().into_iter().filter(|line| line.starts_with("EVENT_JSON:")).collect()
}

fn fresh() -> (Contract, String) {
    reset();
    ctx("buyer.testnet", key_a(), 50, 0);
    let contract = Contract::new(account("token.testnet"));
    (contract, evidence_hex(SENTENCE))
}

fn open_on(contract: &mut Contract, evidence: &str) -> u64 {
    ctx("buyer.testnet", key_a(), 50, 0);
    contract.open(
        account("vendor.testnet"),
        account("sable.testnet"),
        U128(AMOUNT),
        SENTENCE.into(),
        evidence.into(),
        U64(100),
        U64(1_000),
    )
}

fn sign_both(contract: &mut Contract, id: u64) {
    let hash = contract.get(id).unwrap().line_hash;
    ctx("buyer.testnet", key_a(), 50, 0);
    contract.sign(id, hash.clone());
    ctx("vendor.testnet", key_a(), 50, 0);
    contract.sign(id, hash);
}

fn deposit(contract: &mut Contract, id: u64, sender: &str, amount: u128, now: u64) -> U128 {
    ctx("token.testnet", key_a(), now, 0);
    contract.ft_on_transfer(account(sender), U128(amount), id.to_string())
}

fn install(contract: &mut Contract, id: u64, public_key: PublicKey, cap: u128) -> PromiseOrValue<String> {
    ctx("buyer.testnet", key_a(), 50, 1);
    contract.install_agent(id, public_key, U128(cap))
}

fn release_at(contract: &mut Contract, id: u64, public_key: PublicKey, now: u64, evidence: &str) -> PromiseOrValue<String> {
    ctx("meter.testnet", public_key, now, 0);
    contract.release(id, account("sable.testnet"), U128(AMOUNT), evidence.into())
}

fn panic_of(run: impl FnOnce()) -> String {
    let err = catch_unwind(AssertUnwindSafe(run)).expect_err("the call must panic");
    if let Some(text) = err.downcast_ref::<String>() {
        return text.clone();
    }
    if let Some(text) = err.downcast_ref::<&str>() {
        return (*text).to_string();
    }
    "non-string panic".into()
}

fn assert_no_event() {
    assert!(events().is_empty(), "a panic path must not emit; NEAR would drop the log anyway");
}

#[test]
fn fund_refusals_return_the_full_amount_and_leave_the_meter() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    let before = contract.get(id).unwrap();
    let returned = deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50);
    assert_eq!(returned, U128(AMOUNT));
    assert_eq!(contract.get(id).unwrap(), before);
    let logged = events();
    assert!(logged.iter().any(|line| line.contains("\"event\":\"refusal\"") && line.contains("ERR_NEED_BOTH")));

    sign_both(&mut contract, id);
    let before = contract.get(id).unwrap();
    let returned = deposit(&mut contract, id, "vendor.testnet", AMOUNT, 50);
    assert_eq!(returned, U128(AMOUNT));
    assert_eq!(contract.get(id).unwrap(), before);
    assert!(events().iter().any(|line| line.contains("ERR_NOT_BUYER") && line.contains("vendor.testnet")));

    let returned = deposit(&mut contract, id, "buyer.testnet", AMOUNT, 1_000);
    assert_eq!(returned, U128(AMOUNT));
    assert_eq!(contract.get(id).unwrap().funded, U128(0));
    assert!(events().iter().any(|line| line.contains("ERR_TOO_LATE")));

    assert_eq!(deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50), U128(0));
    assert!(events().iter().any(|line| line.contains("\"event\":\"fund\"")));
    promise(install(&mut contract, id, key_a(), AMOUNT));
    promise(release_at(&mut contract, id, key_a(), 500, &evidence));
    callback(500, PromiseResult::Successful(Vec::new()));
    contract.on_released(id, U128(AMOUNT));
    assert!(events().iter().any(|line| line.contains("\"event\":\"paid\"") && line.contains(KEY_A)));
    let before = contract.get(id).unwrap();
    let returned = deposit(&mut contract, id, "buyer.testnet", AMOUNT, 500);
    assert_eq!(returned, U128(AMOUNT));
    assert_eq!(contract.get(id).unwrap(), before);
    assert!(events().iter().any(|line| line.contains("ERR_ALREADY_PAID")));
}

/// `ft_transfer_call` moves the tokens, then `ft_on_transfer` runs, then `ft_resolve_transfer`
/// reads that return value. A refusal returns the full amount, so the callback puts every unit back.
#[test]
fn a_rejected_deposit_is_refunded_by_the_token_callback() {
    let (returned, before_funded) = {
        let (mut contract, evidence) = fresh();
        let id = open_on(&mut contract, &evidence);
        let before = contract.get(id).unwrap();
        let returned = deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50);
        assert_eq!(returned, U128(AMOUNT));
        assert_eq!(contract.get(id).unwrap(), before);
        assert_eq!(before.funded, U128(0));
        (returned, before.funded)
    };
    let bytes = near_sdk::serde_json::to_vec(&returned).unwrap();
    let parsed: U128 = near_sdk::serde_json::from_slice(&bytes).unwrap();
    assert_eq!(parsed, U128(AMOUNT));

    reset();
    on_token("buyer.testnet", 0);
    let mut token = meter_token::Token::new();
    let buyer = account("buyer.testnet");
    let meter = account("meter.testnet");
    token.mint(buyer.clone(), U128(AMOUNT));
    token.register(meter.clone());
    assert_eq!(token.ft_balance_of(buyer.clone()), U128(AMOUNT));
    on_token("buyer.testnet", 1);
    let _ = token.ft_transfer_call(meter.clone(), U128(AMOUNT), None, "1".into());
    assert_eq!(token.ft_balance_of(buyer.clone()), U128(0));
    assert_eq!(token.ft_balance_of(meter.clone()), U128(AMOUNT));

    token_callback(PromiseResult::Successful(bytes));
    let kept = token.ft_resolve_transfer(buyer.clone(), meter.clone(), U128(AMOUNT));
    assert_eq!(kept, U128(0));
    assert_eq!(token.ft_balance_of(buyer), U128(AMOUNT));
    assert_eq!(token.ft_balance_of(meter), U128(0));
    assert_eq!(before_funded, U128(0));
}

#[test]
fn a_deposit_that_fills_an_already_full_meter_is_not_a_refusal() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    assert_eq!(deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50), U128(0));
    let before = contract.get(id).unwrap();
    assert_eq!(deposit(&mut contract, id, "buyer.testnet", 5, 50), U128(5));
    assert_eq!(contract.get(id).unwrap(), before);
    assert!(events().iter().all(|line| !line.contains("\"event\":\"refusal\"") && !line.contains("\"event\":\"fund\"")));
}

#[test]
fn wrong_token_bad_msg_and_unknown_panic_and_emit_nothing() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    let before = contract.get(id).unwrap();

    ctx("buyer.testnet", key_a(), 50, 0);
    let text = panic_of(|| {
        contract.ft_on_transfer(account("buyer.testnet"), U128(AMOUNT), id.to_string());
    });
    assert!(text.contains("ERR_WRONG_TOKEN"), "{text}");
    assert_no_event();
    assert_eq!(contract.get(id).unwrap(), before);

    ctx("token.testnet", key_a(), 50, 0);
    let text = panic_of(|| {
        contract.ft_on_transfer(account("buyer.testnet"), U128(AMOUNT), "not-a-meter".into());
    });
    assert!(text.contains("ERR_BAD_MSG"), "{text}");
    assert_no_event();
    assert_eq!(contract.get(id).unwrap(), before);

    ctx("token.testnet", key_a(), 50, 0);
    let text = panic_of(|| {
        contract.ft_on_transfer(account("buyer.testnet"), U128(AMOUNT), "99".into());
    });
    assert!(text.contains("ERR_UNKNOWN"), "{text}");
    assert_no_event();
    assert_eq!(contract.get(id).unwrap(), before);

    ctx("buyer.testnet", key_a(), 1_000, 0);
    let text = panic_of(|| {
        let _ = contract.refund(99);
    });
    assert!(text.contains("ERR_UNKNOWN"), "{text}");
    assert_no_event();

    ctx("meter.testnet", key_a(), 500, 0);
    let text = panic_of(|| {
        let _ = contract.release(99, account("sable.testnet"), U128(AMOUNT), evidence);
    });
    assert!(text.contains("ERR_UNKNOWN"), "{text}");
    assert_no_event();
}

#[test]
fn refund_codes_do_not_transfer_and_do_not_change_the_meter() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    ctx("buyer.testnet", key_a(), 1_000, 0);
    let before = contract.get(id).unwrap();
    assert_eq!(value(contract.refund(id)), "ERR_NOT_LOCKED");
    assert_eq!(contract.get(id).unwrap(), before);
    assert!(events().iter().any(|line| line.contains("ERR_NOT_LOCKED") && line.contains("\"event\":\"refusal\"")));

    assert_eq!(deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50), U128(0));
    ctx("buyer.testnet", key_a(), 500, 0);
    let before = contract.get(id).unwrap();
    assert_eq!(value(contract.refund(id)), "ERR_TOO_EARLY");
    assert_eq!(contract.get(id).unwrap(), before);

    promise(install(&mut contract, id, key_a(), AMOUNT));
    promise(release_at(&mut contract, id, key_a(), 500, &evidence));
    ctx("buyer.testnet", key_a(), 1_000, 0);
    let before = contract.get(id).unwrap();
    assert!(before.releasing);
    assert_eq!(value(contract.refund(id)), "ERR_BUSY");
    assert_eq!(contract.get(id).unwrap(), before);

    callback(500, PromiseResult::Successful(Vec::new()));
    contract.on_released(id, U128(AMOUNT));
    ctx("buyer.testnet", key_a(), 1_000, 0);
    let before = contract.get(id).unwrap();
    assert_eq!(before.paid, U128(AMOUNT));
    assert_eq!(value(contract.refund(id)), "ERR_ALREADY_PAID");
    assert_eq!(contract.get(id).unwrap(), before);
    assert_eq!(contract.get(id).unwrap().refunded, U128(0));
}

#[test]
fn a_refund_after_the_deadline_emits_refund_only_when_the_transfer_succeeds() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    assert_eq!(deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50), U128(0));
    ctx("vendor.testnet", key_a(), 1_000, 0);
    promise(contract.refund(id));
    assert!(contract.get(id).unwrap().refunding);
    assert_eq!(contract.get(id).unwrap().refunded, U128(0));

    callback(1_000, PromiseResult::Failed);
    contract.on_refunded(id, U128(AMOUNT));
    assert_eq!(contract.get(id).unwrap().refunded, U128(0));
    assert!(!contract.get(id).unwrap().refunding);
    assert!(events().iter().any(|line| line.contains("ERR_TRANSFER") && line.contains("\"event\":\"refusal\"")));

    ctx("vendor.testnet", key_a(), 1_000, 0);
    promise(contract.refund(id));
    callback(1_000, PromiseResult::Successful(Vec::new()));
    contract.on_refunded(id, U128(AMOUNT));
    let meter = contract.get(id).unwrap();
    assert_eq!(meter.refunded, U128(AMOUNT));
    assert_eq!(meter.paid, U128(0));
    assert!(events().iter().any(|line| line.contains("\"event\":\"refund\"") && line.contains("\"code\":\"OK\"")));
}

#[test]
fn the_cap_is_one_number_for_the_key_and_a_failed_callback_gives_the_reservation_back() {
    let (mut contract, evidence) = fresh();
    let first = open_on(&mut contract, &evidence);
    let second = open_on(&mut contract, &evidence);
    sign_both(&mut contract, first);
    sign_both(&mut contract, second);
    assert_eq!(deposit(&mut contract, first, "buyer.testnet", AMOUNT, 50), U128(0));
    assert_eq!(deposit(&mut contract, second, "buyer.testnet", AMOUNT, 50), U128(0));
    promise(install(&mut contract, first, key_a(), AMOUNT));
    let line = contract.get(second).unwrap();
    ctx("buyer.testnet", key_a(), 50, 1);
    let text = panic_of(|| {
        let _ = contract.install_agent(second, key_a(), U128(AMOUNT - 1));
    });
    assert!(text.contains("ERR_CAP_MISMATCH"), "{text}");
    assert_no_event();
    assert_eq!(contract.get(second).unwrap(), line);
    assert!(contract.get(second).unwrap().agent.is_none());
    assert_eq!(contract.get(first).unwrap().agent, Some(key_a()));
    assert_eq!(value(install(&mut contract, second, key_a(), AMOUNT)), "OK");

    promise(release_at(&mut contract, first, key_a(), 500, &evidence));
    ctx("buyer.testnet", key_a(), 500, 0);
    let refusals = contract.get(second).unwrap().refusals;
    assert_eq!(contract.preview(second, account("other.testnet"), U128(AMOUNT), evidence.clone()), "ERR_RECIPIENT");
    assert_eq!(contract.preview(second, account("sable.testnet"), U128(AMOUNT), evidence.clone()), "ERR_CAP");
    assert_eq!(contract.get(second).unwrap().refusals, refusals);

    callback(500, PromiseResult::Failed);
    contract.on_released(first, U128(AMOUNT));
    let failed = contract.get(first).unwrap();
    assert_eq!(failed.paid, U128(0));
    assert!(!failed.releasing);
    assert_eq!(failed.refusals, 0);
    assert!(events().iter().any(|line| line.contains("ERR_TRANSFER")));
    ctx("buyer.testnet", key_a(), 500, 0);
    assert_eq!(contract.preview(second, account("sable.testnet"), U128(AMOUNT), evidence.clone()), "OK");

    promise(release_at(&mut contract, second, key_a(), 500, &evidence));
    callback(500, PromiseResult::Successful(Vec::new()));
    contract.on_released(second, U128(AMOUNT));
    assert_eq!(contract.get(second).unwrap().paid, U128(AMOUNT));
    ctx("buyer.testnet", key_a(), 500, 0);
    let before = contract.get(first).unwrap();
    assert_eq!(contract.preview(first, account("sable.testnet"), U128(AMOUNT), evidence.clone()), "ERR_CAP");
    assert_eq!(contract.get(first).unwrap().refusals, before.refusals);
    assert_eq!(value(release_at(&mut contract, first, key_a(), 500, &evidence)), "ERR_CAP");
    let refused = contract.get(first).unwrap();
    assert_eq!(refused.refusals, before.refusals + 1);
    assert_eq!(refused.paid, U128(0));
    assert_eq!(refused.funded, before.funded);
    assert_eq!(refused.line_hash, before.line_hash);
    assert!(!refused.releasing);
}

#[test]
fn one_unit_over_the_cap_is_err_cap_and_exact_cap_is_allowed() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    assert_eq!(deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50), U128(0));
    promise(install(&mut contract, id, key_a(), AMOUNT - 1));
    let before = contract.get(id).unwrap();
    assert_eq!(value(release_at(&mut contract, id, key_a(), 500, &evidence)), "ERR_CAP");
    let after = contract.get(id).unwrap();
    assert_eq!(after.refusals, 1);
    assert_eq!(after.paid, U128(0));
    assert!(!after.releasing);
    assert_eq!(after.funded, before.funded);
    assert_eq!(after.line_hash, before.line_hash);
    ctx("buyer.testnet", key_a(), 500, 0);
    assert_eq!(contract.preview(id, account("sable.testnet"), U128(AMOUNT), evidence.clone()), "ERR_CAP");
    assert_eq!(contract.get(id).unwrap().refusals, 1);
}

#[test]
fn five_early_refusals_burn_the_key_and_preview_does_not_count() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    assert_eq!(deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50), U128(0));
    promise(install(&mut contract, id, key_a(), AMOUNT));
    let line = contract.get(id).unwrap().line_hash.clone();
    for n in 1..=4 {
        assert_eq!(value(release_at(&mut contract, id, key_a(), 50, &evidence)), "ERR_NOT_YET");
        assert_eq!(contract.get(id).unwrap().refusals, n);
        assert!(events().iter().any(|line| line.contains("ERR_NOT_YET")));
    }
    ctx("buyer.testnet", key_a(), 50, 0);
    assert_eq!(contract.preview(id, account("sable.testnet"), U128(AMOUNT), evidence.clone()), "ERR_NOT_YET");
    assert_eq!(contract.get(id).unwrap().refusals, 4);
    promise(release_at(&mut contract, id, key_a(), 50, &evidence));
    let burned = contract.get(id).unwrap();
    assert_eq!(burned.refusals, 5);
    assert!(burned.revoked);
    assert!(burned.agent.is_none());
    assert_eq!(burned.line_hash, line);
    assert_eq!(burned.paid, U128(0));
    let logged = events();
    assert!(logged.iter().any(|line| line.contains("\"event\":\"refusal\"") && line.contains("ERR_NOT_YET")));
    assert!(logged.iter().any(|line| line.contains("\"event\":\"key\"") && line.contains("BURNED")));

    ctx("meter.testnet", key_a(), 50, 0);
    let text = panic_of(|| {
        let _ = contract.release(id, account("sable.testnet"), U128(AMOUNT), evidence.clone());
    });
    assert!(text.contains("ERR_REVOKED"), "{text}");
    assert_no_event();
    assert_eq!(contract.get(id).unwrap().refusals, 5);

    promise(install(&mut contract, id, key_a(), AMOUNT));
    let again = contract.get(id).unwrap();
    assert_eq!(again.refusals, 0);
    assert!(!again.revoked);
    assert_eq!(again.agent, Some(key_a()));
    assert_eq!(again.line_hash, line);
    assert!(events().iter().any(|line| line.contains("\"event\":\"key\"") && line.contains("install_agent")));
}

#[test]
fn a_failed_transfer_does_not_count_toward_the_five_and_bad_evidence_panics() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    assert_eq!(deposit(&mut contract, id, "buyer.testnet", AMOUNT, 50), U128(0));
    promise(install(&mut contract, id, key_a(), AMOUNT));
    promise(release_at(&mut contract, id, key_a(), 500, &evidence));
    callback(500, PromiseResult::Failed);
    contract.on_released(id, U128(AMOUNT));
    assert_eq!(contract.get(id).unwrap().refusals, 0);
    assert_eq!(contract.get(id).unwrap().paid, U128(0));
    assert!(contract.get(id).unwrap().attempts.iter().any(|attempt| attempt.code == "ERR_TRANSFER"));

    ctx("meter.testnet", key_a(), 500, 0);
    let before = contract.get(id).unwrap();
    let text = panic_of(|| {
        let _ = contract.release(id, account("sable.testnet"), U128(AMOUNT), "zz".into());
    });
    assert!(text.contains("ERR_EVIDENCE"), "{text}");
    assert_no_event();
    assert_eq!(contract.get(id).unwrap(), before);
}

#[test]
fn revoke_keeps_the_account_key_while_another_meter_holds_it() {
    let (mut contract, evidence) = fresh();
    let first = open_on(&mut contract, &evidence);
    let second = open_on(&mut contract, &evidence);
    sign_both(&mut contract, first);
    sign_both(&mut contract, second);
    promise(install(&mut contract, first, key_a(), AMOUNT * 2));
    assert_eq!(value(install(&mut contract, second, key_a(), AMOUNT * 2)), "OK");
    let line = contract.get(first).unwrap().line_hash.clone();
    ctx("buyer.testnet", key_a(), 50, 1);
    assert_eq!(value(contract.revoke_agent(first)), "OK");
    assert!(contract.get(first).unwrap().agent.is_none());
    assert_eq!(contract.get(second).unwrap().agent, Some(key_a()));
    assert_eq!(contract.get(first).unwrap().line_hash, line);
    assert!(events().iter().any(|line| line.contains("revoke_agent")));

    ctx("buyer.testnet", key_a(), 50, 1);
    promise(contract.revoke_agent(second));
    assert!(contract.get(second).unwrap().agent.is_none());
    promise(install(&mut contract, first, key_a(), AMOUNT * 2));
    assert_eq!(contract.get(first).unwrap().agent, Some(key_a()));
    assert_eq!(contract.get(first).unwrap().line_hash, line);
}

#[test]
fn an_event_names_the_standard_and_the_caller() {
    let (mut contract, evidence) = fresh();
    let id = open_on(&mut contract, &evidence);
    sign_both(&mut contract, id);
    assert_eq!(deposit(&mut contract, id, "buyer.testnet", 1_000, 50), U128(0));
    let logged = events();
    assert_eq!(logged.len(), 1);
    assert!(logged[0].starts_with("EVENT_JSON:"));
    assert!(logged[0].contains("\"standard\":\"meter\""));
    assert!(logged[0].contains("\"version\":\"1.0.0\""));
    assert!(logged[0].contains("\"event\":\"fund\""));
    assert!(logged[0].contains("\"data\":[{"));
    assert!(logged[0].contains(&format!("\"meter_id\":\"{id}\"")));
    assert!(logged[0].contains("\"method\":\"ft_on_transfer\""));
    assert!(logged[0].contains("\"caller\":\"buyer.testnet\""));
}
