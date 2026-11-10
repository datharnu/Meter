//! Test token for Meter. Six decimals, like USDC, but this is not Circle's token.
//! `mint` is public and capped per call. The deployed account is created with no access key.

use near_sdk::json_types::U128;
use near_sdk::store::IterableMap;
use near_sdk::{env, ext_contract, near, require, AccountId, Gas, PanicOnDefault, Promise};

const MINT_CAP: u128 = 1_000_000_000_000; // 1,000,000.000000

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Token {
    balances: IterableMap<AccountId, u128>,
    supply: u128,
}

#[near]
impl Token {
    #[init]
    pub fn new() -> Self {
        Self { balances: IterableMap::new(b"b".to_vec()), supply: 0 }
    }

    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(amount.0 > 0 && amount.0 <= MINT_CAP, "ERR_MINT_CAP");
        self.credit(&account_id, amount.0);
        self.supply += amount.0;
    }

    pub fn register(&mut self, account_id: AccountId) {
        if !self.balances.contains_key(&account_id) {
            self.balances.insert(account_id, 0);
        }
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.supply)
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        near_sdk::assert_one_yocto();
        let _ = memo;
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, amount.0);
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        near_sdk::assert_one_yocto();
        require!(msg.len() <= 1024, "ERR_MSG");
        let _ = memo;
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, amount.0);
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(Gas::from_tgas(35))
            .ft_on_transfer(sender.clone(), amount, msg)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(15))
                    .ft_resolve_transfer(sender, receiver_id, amount),
            )
    }

    #[private]
    pub fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let unused = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(bytes) => {
                near_sdk::serde_json::from_slice::<U128>(&bytes).map(|v| v.0).unwrap_or(amount.0)
            }
            _ => amount.0,
        };
        let refund = unused.min(amount.0);
        if refund > 0 {
            let held = self.balances.get(&receiver_id).copied().unwrap_or(0);
            let take = refund.min(held);
            if take > 0 {
                self.balances.insert(receiver_id, held - take);
                self.credit(&sender_id, take);
            }
        }
        U128(amount.0 - refund)
    }
}

impl Token {
    fn credit(&mut self, account: &AccountId, amount: u128) {
        let next = self.balances.get(account).copied().unwrap_or(0).saturating_add(amount);
        self.balances.insert(account.clone(), next);
    }

    fn move_tokens(&mut self, from: &AccountId, to: &AccountId, amount: u128) {
        require!(amount > 0, "ERR_AMOUNT");
        require!(self.balances.contains_key(to), "ERR_NOT_REGISTERED");
        let bal = self.balances.get(from).copied().unwrap_or(0);
        require!(bal >= amount, "ERR_BALANCE");
        self.balances.insert(from.clone(), bal - amount);
        let dest = self.balances.get(to).copied().unwrap_or(0);
        self.balances.insert(to.clone(), dest + amount);
    }
}

#[ext_contract(ext_receiver)]
trait Receiver {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> U128;
}
