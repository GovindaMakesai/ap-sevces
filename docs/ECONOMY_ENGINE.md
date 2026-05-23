# Economy Engine

## Authoritative Wallet

Table: `wallets` — `coin_balance`, `star_balance`  
Ledger: `wallet_transactions` — every credit/debit logged with `reference_type` / `reference_id`

### Operations (`walletService.js`)

| Function | Behavior |
|----------|----------|
| `getOrCreateWallet` | `SELECT … FOR UPDATE` — race-safe |
| `creditCoins` | Positive amount, ledger entry |
| `debitCoins` | Insufficient balance → `INSUFFICIENT_BALANCE` |
| `reserveWithdrawal` | Debit + pending withdrawal row |

## Gift Flow (`giftService.js`)

1. Fraud check (`fraudService.checkGiftAbuse`)
2. Debit sender (full amount)
3. Credit receiver (`creator_amount = amount - platform_fee`)
4. Credit platform treasury (`platformService.creditPlatformFee`)
5. Insert `gift_transactions`
6. Distribute agency commissions (`commissionService.distributeFromGift`)
7. Update live room member gift counts
8. Post-commit: leaderboards, charity allocation, PK scores

## Platform Fee

- Config: `platform_settings.wallet.gift_platform_fee_pct` (default 20%)
- Treasury user: `platform_accounts.slug = 'platform_treasury'`

## Recharge

| Method | Flow |
|--------|------|
| Manual QR | User submits UTR → admin approves → `creditCoins` |
| Razorpay | `payment_intents` → webhook → auto credit + VIP recalc |
| Stripe | Checkout session → webhook → auto credit + VIP recalc |

## Withdrawals

1. User requests → coins debited immediately (`withdrawal_hold`)
2. Admin approves → status `completed` (coins already held)
3. Admin rejects → refund via `creditCoins`

## Agency Commissions

Levels: **12% · 16% · 20%** (performance-based via `agencyPerformanceService`)

On each gift to a creator:
- Walk agency chain from creator's `agency_members`
- Credit agency owner wallets
- Log `agency_commissions`

## VIP

Recharge volume tracked in `vip_memberships.total_recharge_inr`  
Auto level from `vip_levels.min_recharge_inr`

## Charity

Default 1% of gift coin value → `charity_transactions` (configurable in `platform_settings.charity`)

## Invariants

1. No balance change without ledger entry
2. Economy mutations use DB transactions
3. Webhook events deduplicated via `payment_webhook_events (provider, event_id)`
