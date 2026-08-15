/// Glowcast product scope — live social platform only.
///
/// These legacy marketplace modules are intentionally excluded from routes,
/// navigation, and API calls in the Flutter client:
/// - workers / worker dashboard
/// - services marketplace & booking
/// - become-a-pro marketplace flows
/// - coin seller operations center
class AppScope {
  static const excludedModules = [
    'workers',
    'services_marketplace',
    'booking',
    'become_a_pro',
    'coin_seller_ops',
  ];

  static const productTagline = 'Live social · Party rooms · Creators · Gifts';
}
