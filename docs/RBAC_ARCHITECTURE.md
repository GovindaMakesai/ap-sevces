# RBAC Architecture

## Model

- **Legacy role:** `users.role` (used in JWT snapshot at login)
- **Extended roles:** `roles` table — founder, ceo, super_admin, bdm, agency, creator, vip_user, coin_seller
- **Permissions:** `permissions` + `role_permissions` + optional `user_roles`

## Permission Check Flow

```
JWT verify → userId → permissionService.getUserPermissions()
  → legacy role mapping OR user_roles join
  → requirePermission('slug') middleware
```

## Key Permissions

| Slug | Scope |
|------|-------|
| `wallet.read` | Balance & history |
| `wallet.recharge` | Recharge / payment intents |
| `wallet.withdraw` | Withdrawal requests |
| `wallet.gift` | Send gifts |
| `live.host` | Host rooms |
| `live.join` | Join rooms |
| `agency.manage` | Create agency, add members |
| `agency.read` | View analytics |
| `pk.host` | Start PK battles |
| `contest.join` | Enroll in contests |
| `admin.*` | Admin control center |

## Admin Access

`/api/admin/*` requires `users.role = 'admin'` (legacy) **plus** granular `requirePermission` for wallet/agency/fraud operations.

## Security Notes

- JWT role is snapshot — re-login required after role change
- TODO: populate `user_roles` on signup for multi-role users
- Super admin roles inherit full admin permission set via seed
