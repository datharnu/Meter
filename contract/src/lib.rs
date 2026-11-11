use hex::FromHex;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::IterableMap;
use near_sdk::{env, ext_contract, near, require, AccountId, Allowance, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue, PublicKey};

mod attest;
mod rule;
use attest::{check as check_attestation, parse_address, release_line};
use rule::{decide, fund, refund as rule_refund, sign as rule_sign, Clause, Code, Deal, Who};

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
    pub evidence: String,
    pub deadline_ns: u64,
    pub buyer_signed: bool,
    pub vendor_signed: bool,
    pub funded: U128,
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
    /// Model id inside the signed text. Example: `z-ai/glm-5.3-flash`.
    model: String,
    /// Ethereum address of the `provider_tee` key. The quote is not stored.
    tee_signer: [u8; 20],
    next_id: u64,
    meters: IterableMap<u64, MeterState>,
}

#[near]
impl Contract {
    #[init]
    /// `tee_signer_hex` is the `provider_tee` signing address from a verified model report.
    /// This contract checks signatures from that address. It does not check the Intel quote.
    pub fn new(token: AccountId, model: String, tee_signer_hex: String) -> Self {
        require!(!model.is_empty() && model.len() <= 128, "ERR_ATTESTATION");
        let tee_signer = parse_address(&tee_signer_hex).unwrap_or_else(|| env::panic_str("ERR_ATTESTATION"));
        Self { token, model, tee_signer, next_id: 1, meters: IterableMap::new(b"m".to_vec()) }
    }

    pub fn open(
        &mut self,
        vendor: AccountId,
        recipient: AccountId,
        amount: U128,
        evidence_hex: String,
        deadline_ns: U64,
    ) -> u64 {
        let buyer = env::predecessor_account_id();
        require!(amount.0 > 0, "ERR_BAD_AMOUNT");
        require!(parse_evidence(&evidence_hex).is_some(), "ERR_EVIDENCE");
        require!(deadline_ns.0 > env::block_timestamp(), "ERR_TOO_LATE");
        let id = self.next_id;
        self.next_id += 1;
        self.meters.insert(
            id,
            MeterState {
                buyer,
                vendor,
                recipient,
                amount,
                evidence: evidence_hex.to_ascii_lowercase(),
                deadline_ns: deadline_ns.0,
                buyer_signed: false,
                vendor_signed: false,
                funded: U128(0),
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

    /// Buyer installs the only key that can call `release`. The key is limited to that method.
    /// One yoctoNEAR is required, so this key cannot install another key.
    #[payable]
    pub fn install_agent(&mut self, id: u64, public_key: PublicKey) -> Promise {
        near_sdk::assert_one_yocto();
        let mut meter = load(&self.meters, id);
        require!(env::predecessor_account_id() == meter.buyer, "ERR_NOT_BUYER");
        require!(meter.buyer_signed && meter.vendor_signed, "ERR_NEED_BOTH");
        require!(meter.agent.is_none() && !meter.revoked, "ERR_AGENT");
        meter.agent = Some(public_key.clone());
        self.meters.insert(id, meter);
        let me = env::current_account_id();
        let allowance = Allowance::limited(NearToken::from_yoctonear(500_000_000_000_000_000_000_000))
            .unwrap_or_else(|| env::panic_str("ERR_ALLOWANCE"));
        Promise::new(me.clone()).add_access_key_allowance(public_key, allowance, me, "release")
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

    pub fn sign(&mut self, id: u64) {
        let who = env::predecessor_account_id();
        let mut meter = load(&self.meters, id);
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

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128 {
        require!(env::predecessor_account_id() == self.token, "ERR_WRONG_TOKEN");
        let id: u64 = msg.parse().unwrap_or_else(|_| env::panic_str("ERR_BAD_MSG"));
        let mut meter = load(&self.meters, id);
        let mut deal = to_deal(&meter);
        match fund(&mut deal, sender_id == meter.buyer, amount.0) {
            Ok(change) => {
                meter.funded = U128(deal.funded);
                self.meters.insert(id, meter);
                U128(change)
            }
            Err(code) => env::panic_str(code.as_str()),
        }
    }

    /// Pays the stored line only when `request_body` and `response_body` are the exact
    /// bytes of a `provider_tee` signature and both contain this release's line.
    /// A mismatch still moves 0. The deployed account `m028a47` does not run this method.
    pub fn release(
        &mut self,
        id: u64,
        recipient: AccountId,
        amount: U128,
        evidence_hex: String,
        request_body: String,
        response_body: String,
        signature_hex: String,
    ) -> PromiseOrValue<String> {
        require!(env::predecessor_account_id() == env::current_account_id(), "ERR_UNAUTHORIZED");
        let signer = env::signer_account_pk();
        let mut meter = load(&self.meters, id);
        if meter.revoked {
            env::panic_str("ERR_REVOKED");
        }
        require!(meter.agent.as_ref() == Some(&signer), "ERR_UNAUTHORIZED");
        let evidence = parse_evidence(&evidence_hex).unwrap_or_else(|| env::panic_str("ERR_EVIDENCE"));
        let deal = to_deal(&meter);
        if let Err(code) = decide(&deal, recipient.as_str(), amount.0, &evidence, env::block_timestamp()) {
            return self.refuse(id, meter, code.as_str(), signer);
        }
        let line = release_line(id, recipient.as_str(), amount.0, &hex::encode(evidence));
        if let Err(code) = check_attestation(&self.model, &self.tee_signer, &line, &request_body, &response_body, &signature_hex) {
            return self.refuse(id, meter, code, signer);
        }
        meter.paid = amount;
        meter.attempts.push(Attempt { code: "OK".into(), moved: amount });
        self.meters.insert(id, meter);
        PromiseOrValue::Promise(
            ext_ft::ext(self.token.clone())
                .with_static_gas(Gas::from_tgas(15))
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .ft_transfer(recipient, amount, Some(format!("meter {id}")))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(Gas::from_tgas(5))
                        .on_paid(id, amount),
                ),
        )
    }

    pub fn refund(&mut self, id: u64) -> Promise {
        let meter = load(&self.meters, id);
        require!(env::predecessor_account_id() == meter.buyer, "ERR_NOT_BUYER");
        let mut deal = to_deal(&meter);
        let amount = match rule_refund(&mut deal, env::block_timestamp()) {
            Ok(amount) => amount,
            Err(code) => env::panic_str(code.as_str()),
        };
        let buyer = meter.buyer.clone();
        let mut next = meter;
        next.refunded = U128(amount);
        self.meters.insert(id, next);
        ext_ft::ext(self.token.clone())
            .with_static_gas(Gas::from_tgas(15))
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer(buyer, U128(amount), Some(format!("meter {id} refund")))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(5))
                    .on_refunded(id, U128(amount)),
            )
    }

    #[private]
    pub fn on_paid(&mut self, id: u64, amount: U128) {
        if is_promise_success() {
            return;
        }
        if let Some(mut meter) = self.meters.get(&id).cloned() {
            meter.paid.0 = meter.paid.0.saturating_sub(amount.0);
            self.meters.insert(id, meter);
        }
    }

    #[private]
    pub fn on_refunded(&mut self, id: u64, amount: U128) {
        if is_promise_success() {
            return;
        }
        if let Some(mut meter) = self.meters.get(&id).cloned() {
            meter.refunded.0 = meter.refunded.0.saturating_sub(amount.0);
            self.meters.insert(id, meter);
        }
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

    pub fn tee(&self) -> (String, String) {
        (self.model.clone(), hex::encode(self.tee_signer))
    }

    fn refuse(&mut self, id: u64, mut meter: MeterState, code: &str, signer: PublicKey) -> PromiseOrValue<String> {
        meter.refusals += 1;
        meter.attempts.push(Attempt { code: code.into(), moved: U128(0) });
        if meter.attempts.len() > 12 {
            meter.attempts.remove(0);
        }
        let burn = meter.refusals >= 5;
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
            deadline_ns: meter.deadline_ns,
        },
        buyer_signed: meter.buyer_signed,
        vendor_signed: meter.vendor_signed,
        funded: meter.funded.0,
        paid: meter.paid.0,
        refunded: meter.refunded.0,
    }
}

fn parse_evidence(hex_str: &str) -> Option<[u8; 32]> {
    let raw = <[u8; 32]>::from_hex(hex_str.trim()).ok()?;
    Some(raw)
}

fn is_promise_success() -> bool {
    env::promise_results_count() == 1 && matches!(env::promise_result(0), near_sdk::PromiseResult::Successful(_))
}

#[ext_contract(ext_ft)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}
