//! Seeded sequences over the same functions the contract calls.
//! Each trial opens two meters, shuffles a funding half, then shuffles a release half.
//! 300 trials, 34 steps. Seed `0x6D65746572337633`.
//! Callback success alternates, so a failed transfer and a paid meter both occur.
//! A refused release may change the refusal counter, the attempt list, and, on the fifth,
//! `revoked` and `agent`. It does not change the line or a balance.
//! `install_agent` after that burn clears the counter. The harness allows that and checks the line.

use crate::rule::{
    accept_cap, begin_refund, begin_release, cap_allows, conserved, finish_refund, finish_release, fund, record_refusal,
    settle_reservation, sign, Clause, Deal, Who,
};

const TRIALS: u32 = 300;
const STEPS: usize = 34;
const SEED: u64 = 0x6D65_7465_7233_7633;
const AMOUNT: u128 = 48_000_000;
const SENTENCE: &str = "Field report 04, price column at most 100";

struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

#[derive(Clone, Debug)]
struct Meter {
    deal: Deal,
    frozen: Clause,
    sentence: &'static str,
    evidence: [u8; 32],
    refusals: u32,
    attempts: usize,
    revoked: bool,
    agent: bool,
    paid_once: Option<u128>,
    hold: u128,
}

struct Cap {
    cap: u128,
    released: u128,
    reserved: u128,
    known: bool,
}

#[derive(Debug, Default)]
struct Hits {
    rejected_deposits: u32,
    line_refusals: u32,
    cap_refusals: u32,
    mismatches: u32,
    paid: u32,
    failed_callbacks: u32,
    refunded: u32,
    installs: u32,
}

fn open_meter() -> Meter {
    let evidence = [7u8; 32];
    let clause = Clause {
        buyer: "marlow.testnet".into(),
        vendor: "sable.testnet".into(),
        recipient: "sable.testnet".into(),
        amount: AMOUNT,
        evidence,
        not_before_ns: 100,
        deadline_ns: 1_000,
    };
    Meter {
        deal: Deal::open(clause.clone()),
        frozen: clause,
        sentence: SENTENCE,
        evidence,
        refusals: 0,
        attempts: 0,
        revoked: false,
        agent: false,
        paid_once: None,
        hold: 0,
    }
}

fn now(rng: &mut Rng) -> u64 {
    [50, 99, 100, 500, 999, 1_000, 1_500][rng.below(7) as usize]
}

fn refuse(meter: &mut Meter, before: &Deal) {
    let (next, burn) = record_refusal(meter.refusals);
    meter.refusals = next;
    meter.attempts += 1;
    if burn {
        meter.revoked = true;
        meter.agent = false;
    }
    assert_eq!(&meter.deal, before);
}

fn check(meters: &[Meter], cap: &Cap) {
    let mut paid = 0u128;
    for meter in meters {
        assert_eq!(meter.deal.clause, meter.frozen);
        assert_eq!(meter.sentence, SENTENCE);
        assert!(conserved(&meter.deal));
        assert!(meter.deal.paid <= meter.deal.funded);
        assert!(!(meter.deal.releasing && meter.deal.refunding));
        assert!(!(meter.deal.paid > 0 && meter.deal.refunded > 0));
        match meter.paid_once {
            Some(amount) => assert_eq!(meter.deal.paid, amount),
            None => assert_eq!(meter.deal.paid, 0),
        }
        paid += meter.deal.paid;
    }
    if cap.known {
        assert!(cap_allows(cap.released, cap.reserved, 0, cap.cap).is_ok());
        assert!(cap.released <= cap.cap);
        assert_eq!(paid, cap.released);
        let held: u128 = meters.iter().map(|meter| meter.hold).sum();
        assert_eq!(held, cap.reserved);
    }
}

fn remember_paid(meter: &mut Meter) {
    if meter.deal.paid > 0 {
        match meter.paid_once {
            Some(amount) => assert_eq!(amount, meter.deal.paid),
            None => meter.paid_once = Some(meter.deal.paid),
        }
    }
}

fn deck(rng: &mut Rng) -> Vec<u8> {
    let mut early = vec![0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 7, 7];
    let mut late = vec![1, 1, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7];
    for ops in [&mut early, &mut late] {
        for i in (1..ops.len()).rev() {
            let j = rng.below(i as u64 + 1) as usize;
            ops.swap(i, j);
        }
    }
    early.extend(late);
    debug_assert_eq!(early.len(), STEPS);
    early
}

fn eligible(meters: &[Meter], start: usize, pred: impl Fn(&Meter) -> bool) -> Option<usize> {
    let n = meters.len();
    (0..n).map(|offset| (start + offset) % n).find(|&index| pred(&meters[index]))
}

#[test]
fn random_sequences_keep_the_line_the_cap_and_the_money() {
    let mut hits = Hits::default();
    for trial in 0..TRIALS {
        let mut rng = Rng(SEED.wrapping_add(u64::from(trial).wrapping_mul(0x9E37_79B9)));
        let mut meters = vec![open_meter(), open_meter()];
        let mut cap = Cap { cap: 0, released: 0, reserved: 0, known: false };
        check(&meters, &cap);
        for op in deck(&mut rng) {
            let start = rng.below(meters.len() as u64) as usize;
            let index = match op {
                0 => None,
                3 => eligible(&meters, start, |meter| meter.agent && !meter.revoked),
                4 => eligible(&meters, start, |meter| meter.deal.releasing),
                6 => eligible(&meters, start, |meter| meter.deal.refunding),
                7 => eligible(&meters, start, |meter| meter.deal.both_signed() && !meter.agent),
                _ => Some(start),
            };
            if op == 0 && meters.len() < 3 {
                meters.push(open_meter());
                check(&meters, &cap);
                continue;
            }
            let Some(index) = index else {
                check(&meters, &cap);
                continue;
            };
            match op {
                1 => {
                    let meter = &mut meters[index];
                    let before = meter.deal.clone();
                    let who = if !meter.deal.buyer_signed {
                        Who::Buyer
                    } else if !meter.deal.vendor_signed {
                        Who::Vendor
                    } else if rng.below(2) == 0 {
                        Who::Buyer
                    } else {
                        Who::Vendor
                    };
                    let _ = sign(&mut meter.deal, who);
                    if meter.deal.buyer_signed == before.buyer_signed && meter.deal.vendor_signed == before.vendor_signed {
                        assert_eq!(meter.deal, before);
                    }
                    assert_eq!(meter.deal.clause, before.clause);
                }
                2 => {
                    let meter = &mut meters[index];
                    let before = meter.deal.clone();
                    let stamp = (meter.refusals, meter.revoked, meter.agent, meter.attempts);
                    let cap_stamp = (cap.released, cap.reserved, cap.cap, cap.known);
                    let amount = if rng.below(4) == 0 {
                        [0, 1, AMOUNT + 9][rng.below(3) as usize]
                    } else {
                        AMOUNT
                    };
                    let buyer = rng.below(6) != 0;
                    let when = if rng.below(5) == 0 { now(&mut rng) } else { 50 };
                    if fund(&mut meter.deal, buyer, amount, when).is_err() {
                        assert_eq!(meter.deal, before);
                        assert_eq!((meter.refusals, meter.revoked, meter.agent, meter.attempts), stamp);
                        assert_eq!((cap.released, cap.reserved, cap.cap, cap.known), cap_stamp);
                        hits.rejected_deposits += 1;
                    }
                }
                3 => {
                    let meter = &mut meters[index];
                    let before = meter.deal.clone();
                    let mut trial_deal = meter.deal.clone();
                    let recipient = if rng.below(8) == 0 { "other.testnet" } else { "sable.testnet" };
                    let amount = if rng.below(8) == 0 { 1 } else { AMOUNT };
                    let mut evidence = meter.evidence;
                    if rng.below(8) == 0 {
                        evidence[0] ^= 1;
                    }
                    let when = if rng.below(5) == 0 { now(&mut rng) } else { 500 };
                    match begin_release(&mut trial_deal, recipient, amount, &evidence, when) {
                        Err(_) => {
                            assert_eq!(trial_deal, before);
                            refuse(meter, &before);
                            hits.line_refusals += 1;
                        }
                        Ok(pay) => {
                            let allowed = cap.known && cap_allows(cap.released, cap.reserved, pay, cap.cap).is_ok();
                            if !allowed {
                                refuse(meter, &before);
                                hits.cap_refusals += 1;
                            } else {
                                meter.deal = trial_deal;
                                cap.reserved += pay;
                                meter.hold = pay;
                            }
                        }
                    }
                }
                4 => {
                    let meter = &mut meters[index];
                    let pay = meter.hold;
                    // Alternate so a failed callback and a paid meter both show up. The sequence is still shuffled.
                    let succeeded = (hits.paid + hits.failed_callbacks) % 2 == 1;
                    let (released, reserved) = settle_reservation(cap.released, cap.reserved, pay, succeeded);
                    cap.released = released;
                    cap.reserved = reserved;
                    meter.hold = 0;
                    finish_release(&mut meter.deal, succeeded);
                    remember_paid(meter);
                    if succeeded {
                        hits.paid += 1;
                    } else {
                        meter.attempts += 1;
                        hits.failed_callbacks += 1;
                    }
                }
                5 => {
                    let meter = &mut meters[index];
                    let before = meter.deal.clone();
                    let mut trial_deal = meter.deal.clone();
                    let when = if rng.below(5) == 0 { now(&mut rng) } else { 1_000 };
                    if begin_refund(&mut trial_deal, when).is_ok() {
                        meter.deal = trial_deal;
                    } else {
                        assert_eq!(trial_deal, before);
                        assert_eq!(meter.deal, before);
                    }
                }
                6 => {
                    let meter = &mut meters[index];
                    let succeeded = rng.below(3) != 0;
                    finish_refund(&mut meter.deal, succeeded);
                    if succeeded {
                        hits.refunded += 1;
                    }
                }
                _ => {
                    let tight = trial % 2 == 1;
                    let offer = if !cap.known {
                        if tight { AMOUNT - 1 } else { AMOUNT * 2 }
                    } else if rng.below(2) == 0 {
                        cap.cap
                    } else {
                        cap.cap.saturating_add(1)
                    };
                    let meter = &mut meters[index];
                    let before = meter.deal.clone();
                    let released = cap.released;
                    match accept_cap(cap.known.then_some(cap.cap), offer) {
                        Err(_) => {
                            assert_eq!(meter.deal, before);
                            hits.mismatches += 1;
                        }
                        Ok(stored) => {
                            if !cap.known {
                                cap.cap = stored;
                                cap.known = true;
                            }
                            if meter.revoked {
                                meter.revoked = false;
                                meter.refusals = 0;
                            }
                            meter.agent = true;
                            assert_eq!(meter.deal, before);
                            assert_eq!(cap.released, released);
                            hits.installs += 1;
                        }
                    }
                }
            }
            check(&meters, &cap);
        }
    }
    assert!(hits.rejected_deposits > 0, "{hits:?}");
    assert!(hits.line_refusals > 0, "{hits:?}");
    assert!(hits.cap_refusals > 0, "{hits:?}");
    assert!(hits.mismatches > 0, "{hits:?}");
    assert!(hits.paid > 0, "{hits:?}");
    assert!(hits.failed_callbacks > 0, "{hits:?}");
    assert!(hits.refunded > 0, "{hits:?}");
    assert!(hits.installs > 0, "{hits:?}");
    eprintln!(
        "property seed {SEED:#x}: {TRIALS} trials x {STEPS} steps; rejected deposits {}, line refusals {}, cap refusals {}, cap mismatches {}, payments {}, failed callbacks {}, refunds {}, installs {}",
        hits.rejected_deposits, hits.line_refusals, hits.cap_refusals, hits.mismatches, hits.paid, hits.failed_callbacks, hits.refunded, hits.installs
    );
}
