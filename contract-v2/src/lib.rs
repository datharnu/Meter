//! Meter v2. One contract, many meters. `release` pays the stored line only when
//! block time is at or after `not_before_ns` and before `deadline_ns`.
//! The meter is marked paid in the transfer callback, and only when that transfer succeeds.
//! `m028a47` and `m2b2440` are earlier contracts. Do not deploy this wasm onto them.

use hex::FromHex;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::IterableMap;
use near_sdk::{env, ext_contract, near, require, AccountId, Allowance, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PublicKey};

mod rule;
#[cfg(test)]
mod v3;
use rule::{
    accept_token, begin_refund, begin_release, check_window, decide, finish_refund, finish_release, fund, line_bytes,
    line_hash_hex, normalize_sentence, record_refusal, sign as rule_sign, Clause, Code, Deal, Who, RELEASE_METHOD,
    evidence_hex as hash_sentence,
};

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Attempt {
    pub code: String,
    pub moved: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
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
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    token: AccountId,
    next_id: u64,
    meters: IterableMap<u64, MeterState>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(token: AccountId) -> Self {
        Self { token, next_id: 1, meters: IterableMap::new(b"m".to_vec()) }
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

    /// Buyer installs the only live key that can call `release`. The key is limited to that method.
    /// After the tripwire or `revoke_agent`, the same call puts a new key on the same line.
    /// 2026-11-11: this used to require `!revoked`, so five refusals left a funded line with no key
    /// until the deadline. Reinstall clears the counter only. Recipient, amount, sentence, and the window stay.
    #[payable]
    pub fn install_agent(&mut self, id: u64, public_key: PublicKey) -> Promise {
        near_sdk::assert_one_yocto();
        let mut meter = load(&self.meters, id);
        require!(env::predecessor_account_id() == meter.buyer, "ERR_NOT_BUYER");
        require!(meter.buyer_signed && meter.vendor_signed, "ERR_NEED_BOTH");
        require!(meter.agent.is_none(), "ERR_AGENT");
        if meter.revoked {
            meter.revoked = false;
            meter.refusals = 0;
        }
        meter.agent = Some(public_key.clone());
        self.meters.insert(id, meter);
        let me = env::current_account_id();
        let allowance = Allowance::limited(NearToken::from_yoctonear(500_000_000_000_000_000_000_000))
            .unwrap_or_else(|| env::panic_str("ERR_ALLOWANCE"));
        Promise::new(me.clone()).add_access_key_allowance(public_key, allowance, me, RELEASE_METHOD)
    }

    /// Buyer kill switch. The key is marked dead in this receipt and deleted in the same transaction.
    #[payable]
    pub fn revoke_agent(&mut self, id: u64) -> Promise {
        near_sdk::assert_one_yocto();
        let mut meter = load(&self.meters, id);
        require!(env::predecessor_account_id() == meter.buyer, "ERR_NOT_BUYER");
        let key = meter.agent.take().unwrap_or_else(|| env::panic_str("ERR_NO_AGENT"));
        meter.revoked = true;
        self.meters.insert(id, meter);
        Promise::new(env::current_account_id()).delete_key(key)
    }

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
                meter.funded = U128(deal.funded);
                self.meters.insert(id, meter);
                U128(change)
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
        meter.releasing = true;
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
    pub fn refund(&mut self, id: u64) -> Promise {
        let mut meter = load(&self.meters, id);
        let mut deal = to_deal(&meter);
        let amount = match begin_refund(&mut deal, env::block_timestamp()) {
            Ok(amount) => amount,
            Err(code) => env::panic_str(code.as_str()),
        };
        meter.refunding = true;
        let buyer = meter.buyer.clone();
        self.meters.insert(id, meter);
        ext_ft::ext(self.token.clone())
            .with_static_gas(Gas::from_tgas(15))
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer(buyer, U128(amount), Some(format!("meter {id} refund")))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .on_refunded(id, U128(amount)),
            )
    }

    #[private]
    pub fn on_released(&mut self, id: u64, amount: U128) {
        let Some(mut meter) = self.meters.get(&id).cloned() else {
            return;
        };
        let mut deal = to_deal(&meter);
        finish_release(&mut deal, is_promise_success());
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
    }

    #[private]
    pub fn on_refunded(&mut self, id: u64, amount: U128) {
        let Some(mut meter) = self.meters.get(&id).cloned() else {
            return;
        };
        let mut deal = to_deal(&meter);
        finish_refund(&mut deal, is_promise_success());
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
    }

    pub fn preview(&self, id: u64, recipient: AccountId, amount: U128, evidence_hex: String) -> String {
        let Some(meter) = self.meters.get(&id) else {
            return "ERR_UNKNOWN".into();
        };
        let Some(evidence) = parse_evidence(&evidence_hex) else {
            return Code::Evidence.as_str().into();
        };
        match decide(&to_deal(meter), recipient.as_str(), amount.0, &evidence, env::block_timestamp()) {
            Ok(()) => Code::Ok.as_str().into(),
            Err(code) => code.as_str().into(),
        }
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
        if burn {
            return PromiseOrValue::Promise(Promise::new(env::current_account_id()).delete_key(signer));
        }
        PromiseOrValue::Value(code.to_string())
    }
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
