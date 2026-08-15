/// GlowCast scope — social/live platform only.
/// Workers, services marketplace, and booking are intentionally excluded.
class AppScope {
  static const excludedModules = [
    'workers',
    'services_marketplace',
    'booking',
    'become_a_pro',
    'coin_seller_ops',
  ];
}
