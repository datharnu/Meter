use hex::FromHex;
use near_sdk::json_types::U128;
use near_sdk::store::IterableMap;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};

mod rule;
use rule::{decide, fund, refund, sign, Clause, Code, Deal, Who};

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

    pub fn open(
        &mut self,
        vendor: AccountId,
        recipient: AccountId,
        amount: U128,
        evidence_hex: String,
        deadline_ns: u64,
    ) -> u64 {
        let buyer = env::predecessor_account_id();
        require!(amount.0 > 0, "ERR_BAD_AMOUNT");
        require!(parse_evidence(&evidence_hex).is_some(), "ERR_EVIDENCE");
        require!(deadline_ns > env::block_timestamp(), "ERR_TOO_LATE");
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
                deadline_ns,
                buyer_signed: false,
                vendor_signed: false,
                funded: U128(0),
                paid: U128(0),
                refunded: U128(0),
            },
        );
        id
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
        match sign(&mut deal, party) {
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

    pub fn release(&mut self, id: u64, recipient: AccountId, amount: U128, evidence_hex: String) -> Promise {
        let meter = load(&self.meters, id);
        let deal = to_deal(&meter);
        let evidence = parse_evidence(&evidence_hex).unwrap_or_else(|| env::panic_str("ERR_EVIDENCE"));
        match decide(&deal, recipient.as_str(), amount.0, &evidence, env::block_timestamp()) {
            Ok(()) => {}
            Err(code) => env::panic_str(code.as_str()),
        }
        let mut next = meter.clone();
        next.paid = amount;
        self.meters.insert(id, next);
        ext_ft::ext(self.token.clone())
            .with_static_gas(Gas::from_tgas(15))
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .ft_transfer(recipient, amount, Some(format!("meter {id}")))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(5))
                    .on_paid(id, amount),
            )
    }

    pub fn refund(&mut self, id: u64) -> Promise {
        let meter = load(&self.meters, id);
        let mut deal = to_deal(&meter);
        let amount = match refund(&mut deal, env::block_timestamp()) {
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
