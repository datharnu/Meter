//! Meter v3. One contract, many meters. `release` pays the stored line only when
//! block time is at or after `not_before_ns` and before `deadline_ns`.
//! The meter is marked paid in the transfer callback, and only when that transfer succeeds.
//! A public key has one cap for every meter on this contract. `ERR_CAP` means that cap
//! would be exceeded. `ERR_CAP_MISMATCH` means a later install named a different cap.
//! The cap does not bound the stored line, a deposit, a refund, the 0.5 NEAR gas
//! allowance, any other key, any other contract, a failed line check, or `preview`.
//! `ERR_WRONG_TOKEN`, `ERR_BAD_MSG`, and `ERR_UNKNOWN` still panic on a change call.
//! NEAR drops logs from a panicked receipt, so those paths have no event.
//! `release` also panics, and drops its log, on `ERR_UNAUTHORIZED`, `ERR_REVOKED`, and a bad evidence hex.
//! `BURNED` is the key event when the fifth refusal clears this meter's agent.
//! Do not deploy this wasm onto m028a47, m2b2440, m1870dd, i198b44, h3743c5, h09d6ce, or medbf5c.

use hex::FromHex;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::IterableMap;
use near_sdk::{env, ext_contract, near, require, AccountId, Allowance, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PublicKey};

mod rule;
#[cfg(test)]
mod calls;
#[cfg(test)]
mod prop;
#[cfg(test)]
mod v3;
use rule::{
    accept_cap, accept_token, begin_refund, begin_release, cap_allows, check_window, decide, event_json, finish_refund,
    finish_release, fund, line_bytes, line_hash_hex, normalize_sentence, record_refusal, settle_reservation, sign as rule_sign,
    Clause, Code, Deal, Who, RELEASE_METHOD, evidence_hex as hash_sentence,
};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Attempt {
    pub code: String,
    pub moved: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct MeterState {
    pub buyer: AccountId,
    pub vendor: AccountId,
    pub recipient: AccountId,
    pub amount: U128,
    pub sentence: String,
    pub evidence: String,
    pub not_before_ns: u64,
    pub deadline_ns: u64,
    pub line_hash: String,
    pub buyer_signed: bool,
    pub vendor_signed: bool,
    pub funded: U128,
    pub releasing: bool,
    pub refunding: bool,
    pub paid: U128,
    pub refunded: U128,
    pub agent: Option<PublicKey>,
    pub revoked: bool,
    pub refusals: u32,
    pub attempts: Vec<Attempt>,
    /// The key that reserved cap for the transfer now in flight.
    pub releasing_key: Option<PublicKey>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct KeyCap {
    pub cap: U128,
    pub released: U128,
    pub reserved: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: AccountId,
    next_id: u64,
    meters: IterableMap<u64, MeterState>,
    keys: IterableMap<PublicKey, KeyCap>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(token: AccountId) -> Self {
        Self {
            token,
            next_id: 1,
            meters: IterableMap::new(b"m".to_vec()),
            keys: IterableMap::new(b"k".to_vec()),
        }
    }

    pub fn token(&self) -> AccountId {
        self.token.clone()
    }

    pub fn open(
        &mut self,
        vendor: AccountId,
        recipient: AccountId,
        amount: U128,
        sentence: String,
        evidence_hex: String,
        not_before_ns: U64,
        deadline_ns: U64,
    ) -> u64 {
        let buyer = env::predecessor_account_id();
        require!(amount.0 > 0, "ERR_BAD_AMOUNT");
        require!(!sentence.is_empty() && sentence.len() <= 512, "ERR_EVIDENCE");
        let sentence = normalize_sentence(&sentence);
        let evidence = hash_sentence(&sentence);
        require!(evidence == evidence_hex.to_ascii_lowercase(), "ERR_EVIDENCE");
        match check_window(env::block_timestamp(), not_before_ns.0, deadline_ns.0) {
            Ok(()) => {}
            Err(code) => env::panic_str(code.as_str()),
        }
        let id = self.next_id;
        self.next_id += 1;
        let line_hash = line_hash_hex(&line_bytes(
            &env::current_account_id().to_string(),
            id,
            &self.token.to_string(),
            recipient.as_str(),
            amount.0,
            not_before_ns.0,
            deadline_ns.0,
            &sentence,
        ));
        self.meters.insert(
            id,
            MeterState {
                buyer,
                vendor,
                recipient,
                amount,
                sentence,
                evidence,
                not_before_ns: not_before_ns.0,
                deadline_ns: deadline_ns.0,
                line_hash,
                buyer_signed: false,
                vendor_signed: false,
                funded: U128(0),
                releasing: false,
                refunding: false,
                paid: U128(0),
                refunded: U128(0),
                agent: None,
                revoked: false,
                refusals: 0,
                attempts: Vec::new(),
                releasing_key: None,
            },
        );
        id
    }

    /// The caller must be the buyer or the vendor named on this meter, and must pass the stored line hash.
    /// This is an account call. It is not a detached signature.
    pub fn sign(&mut self, id: u64, line_hash: String) {
        let who = env::predecessor_account_id();
        let mut meter = load(&self.meters, id);
        require!(line_hash == meter.line_hash, "ERR_LINE");
        let party = if who == meter.buyer {
            Who::Buyer
        } else if who == meter.vendor {
            Who::Vendor
        } else {
            env::panic_str(Code::NotParty.as_str());
        };
        let mut deal = to_deal(&meter);
        match rule_sign(&mut deal, party) {
            Ok(()) => {}
            Err(code) => env::panic_str(code.as_str()),
        }
        meter.buyer_signed = deal.buyer_signed;
        meter.vendor_signed = deal.vendor_signed;
        self.meters.insert(id, meter);
    }

    /// Buyer installs the only live key that can call `release` on this meter.
    /// `cap` is the most this public key may release, added up across meters on this contract.
    /// The first install stores it. A later install of the same key must pass the same cap
    /// (`ERR_CAP_MISMATCH` panics, and that log is dropped). The account key is added only
    /// when no meter currently holds it, so a second meter does not add it again, and a
    /// reinstall after the last copy was removed does. Reinstall clears this meter's refusal
    /// counter only. It does not reset `released`, and it does not change the line.
    #[payable]
    pub fn install_agent(&mut self, id: u64, public_key: PublicKey, cap: U128) -> PromiseOrValue<String> {
        near_sdk::assert_one_yocto();
        let mut meter = load(&self.meters, id);
        require!(env::predecessor_account_id() == meter.buyer, "ERR_NOT_BUYER");
        require!(meter.buyer_signed && meter.vendor_signed, "ERR_NEED_BOTH");
        require!(meter.agent.is_none(), "ERR_AGENT");
        let existing = self.keys.get(&public_key).cloned();
        let cap_amount = match accept_cap(existing.as_ref().map(|row| row.cap.0), cap.0) {
            Ok(amount) => amount,
            Err(code) => env::panic_str(code.as_str()),
        };
        let already_on_account = self.meters.iter().any(|(_, row)| row.agent.as_ref() == Some(&public_key));
        if meter.revoked {
            meter.revoked = false;
            meter.refusals = 0;
        }
        meter.agent = Some(public_key.clone());
        self.meters.insert(id, meter);
        if existing.is_none() {
            self.keys.insert(
                public_key.clone(),
                KeyCap { cap: U128(cap_amount), released: U128(0), reserved: U128(0) },
            );
        }
        emit("key", id, "install_agent", "OK", &env::predecessor_account_id().to_string());
        if !already_on_account {
            let me = env::current_account_id();
            let allowance = Allowance::limited(NearToken::from_yoctonear(500_000_000_000_000_000_000_000))
                .unwrap_or_else(|| env::panic_str("ERR_ALLOWANCE"));
            PromiseOrValue::Promise(Promise::new(me.clone()).add_access_key_allowance(public_key, allowance, me, RELEASE_METHOD))
        } else {
            PromiseOrValue::Value("OK".into())
        }
    }

    /// Buyer kill switch. The account key is deleted only when no other meter still uses it.
    /// The cap's `released` total stays, so a later install of the same key cannot raise it.
    #[payable]
    pub fn revoke_agent(&mut self, id: u64) -> PromiseOrValue<String> {
        near_sdk::assert_one_yocto();
        let mut meter = load(&self.meters, id);
        require!(env::predecessor_account_id() == meter.buyer, "ERR_NOT_BUYER");
        let key = meter.agent.take().unwrap_or_else(|| env::panic_str("ERR_NO_AGENT"));
        meter.revoked = true;
        self.meters.insert(id, meter);
        let still_used = self.meters.iter().any(|(_, row)| row.agent.as_ref() == Some(&key));
        emit("key", id, "revoke_agent", "OK", &env::predecessor_account_id().to_string());
        if still_used {
            PromiseOrValue::Value("OK".into())
        } else {
            PromiseOrValue::Promise(Promise::new(env::current_account_id()).delete_key(key))
        }
    }

    /// `ERR_TOO_LATE`, `ERR_NEED_BOTH`, `ERR_NOT_BUYER`, and `ERR_ALREADY_PAID` return the full
    /// amount and leave the meter as it was. The token sends that amount back.
    /// `ERR_WRONG_TOKEN`, `ERR_BAD_MSG`, and `ERR_UNKNOWN` panic. NEAR drops their logs.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        match accept_token(env::predecessor_account_id() == self.token) {
            Ok(()) => {}
            Err(code) => env::panic_str(code.as_str()),
        }
        let id: u64 = msg.parse().unwrap_or_else(|_| env::panic_str("ERR_BAD_MSG"));
        let mut meter = load(&self.meters, id);
        let mut deal = to_deal(&meter);
        match fund(&mut deal, sender_id == meter.buyer, amount.0, env::block_timestamp()) {
            Ok(change) => {
                let kept = amount.0 - change;
                meter.funded = U128(deal.funded);
                self.meters.insert(id, meter);
                if kept > 0 {
                    emit("fund", id, "ft_on_transfer", "OK", &sender_id.to_string());
                }
                U128(change)
            }
            Err(code) if matches!(code, Code::TooLate | Code::NeedBoth | Code::NotBuyer | Code::AlreadyPaid) => {
                emit("refusal", id, "ft_on_transfer", code.as_str(), &sender_id.to_string());
                U128(amount.0)
            }
            Err(code) => env::panic_str(code.as_str()),
        }
    }

    /// Pays the stored recipient the stored amount, or records a refusal and moves 0.
    /// `paid` stays 0 until `on_released` sees a successful token transfer.
    pub fn release(
        &mut self,
        id: u64,
        recipient: AccountId,
        amount: U128,
        evidence_hex: String,
    ) -> PromiseOrValue<String> {
        require!(env::predecessor_account_id() == env::current_account_id(), "ERR_UNAUTHORIZED");
        let signer = env::signer_account_pk();
        let mut meter = load(&self.meters, id);
        if meter.revoked {
            env::panic_str("ERR_REVOKED");
        }
        require!(meter.agent.as_ref() == Some(&signer), "ERR_UNAUTHORIZED");
        let evidence = parse_evidence(&evidence_hex).unwrap_or_else(|| env::panic_str("ERR_EVIDENCE"));
        let mut deal = to_deal(&meter);
        let pay = match begin_release(&mut deal, recipient.as_str(), amount.0, &evidence, env::block_timestamp()) {
            Ok(pay) => pay,
            Err(code) => return self.refuse(id, meter, code.as_str(), signer),
        };
        let Some(mut row) = self.keys.get(&signer).cloned() else {
            return self.refuse(id, meter, Code::Cap.as_str(), signer);
        };
        if let Err(code) = cap_allows(row.released.0, row.reserved.0, pay, row.cap.0) {
            return self.refuse(id, meter, code.as_str(), signer);
        }
        row.reserved = U128(row.reserved.0 + pay);
        self.keys.insert(signer.clone(), row);
        meter.releasing = true;
        meter.releasing_key = Some(signer);
        let stored_recipient = meter.recipient.clone();
        let stored_amount = meter.amount;
        self.meters.insert(id, meter);
        PromiseOrValue::Promise(
            ext_ft::ext(self.token.clone())
                .with_static_gas(Gas::from_tgas(15))
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .ft_transfer(stored_recipient, stored_amount, Some(format!("meter {id}")))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(10))
                        .on_released(id, U128(pay)),
                ),
        )
    }

    /// Anyone may call this after the deadline. It pays the stored buyer their own deposit.
    /// `ERR_TOO_EARLY`, `ERR_NOT_LOCKED`, `ERR_BUSY`, and `ERR_ALREADY_PAID` return the code.
    /// Those four do not transfer and do not change the meter.
    pub fn refund(&mut self, id: u64) -> PromiseOrValue<String> {
        let mut meter = load(&self.meters, id);
        let mut deal = to_deal(&meter);
        let amount = match begin_refund(&mut deal, env::block_timestamp()) {
            Ok(amount) => amount,
            Err(code) => {
                emit("refusal", id, "refund", code.as_str(), &env::predecessor_account_id().to_string());
                return PromiseOrValue::Value(code.as_str().into());
            }
        };
        meter.refunding = true;
        let buyer = meter.buyer.clone();
        self.meters.insert(id, meter);
        PromiseOrValue::Promise(
            ext_ft::ext(self.token.clone())
                .with_static_gas(Gas::from_tgas(15))
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .ft_transfer(buyer, U128(amount), Some(format!("meter {id} refund")))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(10))
                        .on_refunded(id, U128(amount)),
                ),
        )
    }

    #[private]
    pub fn on_released(&mut self, id: u64, amount: U128) {
        let Some(mut meter) = self.meters.get(&id).cloned() else {
            return;
        };
        let succeeded = is_promise_success();
        let in_flight = meter.releasing;
        let caller = meter.releasing_key.as_ref().map(|key| key.to_string()).unwrap_or_default();
        if in_flight {
            if let Some(key) = meter.releasing_key.clone() {
                if let Some(mut row) = self.keys.get(&key).cloned() {
                    let (released, reserved) = settle_reservation(row.released.0, row.reserved.0, amount.0, succeeded);
                    row.released = U128(released);
                    row.reserved = U128(reserved);
                    self.keys.insert(key, row);
                }
            }
        }
        meter.releasing_key = None;
        let mut deal = to_deal(&meter);
        finish_release(&mut deal, succeeded);
        meter.releasing = deal.releasing;
        meter.paid = U128(deal.paid);
        let ok = meter.paid.0 == amount.0 && amount.0 > 0;
        meter.attempts.push(Attempt {
            code: if ok { "OK" } else { "ERR_TRANSFER" }.into(),
            moved: if ok { amount } else { U128(0) },
        });
        if meter.attempts.len() > 12 {
            meter.attempts.remove(0);
        }
        self.meters.insert(id, meter);
        if in_flight && ok {
            emit("paid", id, "release", "OK", &caller);
        } else if in_flight {
            // `ERR_TRANSFER` is recorded here and does not pass through `refuse`, so the counter stays.
            emit("refusal", id, "release", "ERR_TRANSFER", &caller);
        }
    }

    #[private]
    pub fn on_refunded(&mut self, id: u64, amount: U128) {
        let Some(mut meter) = self.meters.get(&id).cloned() else {
            return;
        };
        let in_flight = meter.refunding;
        let mut deal = to_deal(&meter);
        let succeeded = is_promise_success();
        finish_refund(&mut deal, succeeded);
        meter.refunding = deal.refunding;
        meter.refunded = U128(deal.refunded);
        let ok = meter.refunded.0 == amount.0 && amount.0 > 0;
        meter.attempts.push(Attempt {
            code: if ok { "OK" } else { "ERR_TRANSFER" }.into(),
            moved: if ok { amount } else { U128(0) },
        });
        if meter.attempts.len() > 12 {
            meter.attempts.remove(0);
        }
        self.meters.insert(id, meter);
        let caller = env::predecessor_account_id().to_string();
        if in_flight && ok {
            emit("refund", id, "refund", "OK", &caller);
        } else if in_flight {
            emit("refusal", id, "refund", "ERR_TRANSFER", &caller);
        }
    }

    /// `ERR_UNKNOWN` is a string here. On a change call the same missing meter panics, and that log is dropped.
    /// After the line checks, an installed key that cannot cover `amount` returns `ERR_CAP`.
    /// That return does not write the refusal counter.
    pub fn preview(&self, id: u64, recipient: AccountId, amount: U128, evidence_hex: String) -> String {
        let Some(meter) = self.meters.get(&id) else {
            return "ERR_UNKNOWN".into();
        };
        let Some(evidence) = parse_evidence(&evidence_hex) else {
            return Code::Evidence.as_str().into();
        };
        if let Err(code) = decide(&to_deal(meter), recipient.as_str(), amount.0, &evidence, env::block_timestamp()) {
            return code.as_str().into();
        }
        if let Some(key) = meter.agent.as_ref() {
            match self.keys.get(key) {
                Some(row) if cap_allows(row.released.0, row.reserved.0, amount.0, row.cap.0).is_ok() => {}
                _ => return Code::Cap.as_str().into(),
            }
        }
        Code::Ok.as_str().into()
    }

    pub fn get(&self, id: u64) -> Option<MeterState> {
        self.meters.get(&id).cloned()
    }

    /// `ERR_NOT_YET` counts. `ERR_TRANSFER` never enters here. The fifth call deletes `signer`.
    fn refuse(&mut self, id: u64, mut meter: MeterState, code: &str, signer: PublicKey) -> PromiseOrValue<String> {
        let (refusals, burn) = record_refusal(meter.refusals);
        meter.refusals = refusals;
        meter.attempts.push(Attempt { code: code.into(), moved: U128(0) });
        if meter.attempts.len() > 12 {
            meter.attempts.remove(0);
        }
        if burn {
            meter.revoked = true;
            meter.agent = None;
        }
        self.meters.insert(id, meter);
        emit("refusal", id, "release", code, &signer.to_string());
        if burn {
            emit("key", id, "release", "BURNED", &signer.to_string());
            let still_used = self.meters.iter().any(|(_, row)| row.agent.as_ref() == Some(&signer));
            if !still_used {
                return PromiseOrValue::Promise(Promise::new(env::current_account_id()).delete_key(signer));
            }
        }
        PromiseOrValue::Value(code.to_string())
    }
}

fn emit(event: &str, meter_id: u64, method: &str, code: &str, caller: &str) {
    env::log_str(&format!("EVENT_JSON:{}", event_json(event, meter_id, method, code, caller)));
}

fn load(meters: &IterableMap<u64, MeterState>, id: u64) -> MeterState {
    meters.get(&id).cloned().unwrap_or_else(|| env::panic_str("ERR_UNKNOWN"))
}

fn to_deal(meter: &MeterState) -> Deal {
    Deal {
        clause: Clause {
            buyer: meter.buyer.to_string(),
            vendor: meter.vendor.to_string(),
            recipient: meter.recipient.to_string(),
            amount: meter.amount.0,
            evidence: parse_evidence(&meter.evidence).unwrap_or([0u8; 32]),
            not_before_ns: meter.not_before_ns,
            deadline_ns: meter.deadline_ns,
        },
        buyer_signed: meter.buyer_signed,
        vendor_signed: meter.vendor_signed,
        funded: meter.funded.0,
        releasing: meter.releasing,
        refunding: meter.refunding,
        paid: meter.paid.0,
        refunded: meter.refunded.0,
    }
}

fn parse_evidence(hex_str: &str) -> Option<[u8; 32]> {
    <[u8; 32]>::from_hex(hex_str.trim()).ok()
}

fn is_promise_success() -> bool {
    env::promise_results_count() == 1 && matches!(env::promise_result(0), near_sdk::PromiseResult::Successful(_))
}

#[ext_contract(ext_ft)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}
