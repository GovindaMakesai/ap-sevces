/// Glowcast mobile app — API config (Render + Supabase backend).
class AppConfig {
  static const String appName = 'Glowcast';
  static const String appSlug = 'glowcast';

  static const bool useHttpsDomain = true;
  /// Your Render backend — update if you rename the service on Render.
  static const String backendUrl = 'https://lumoroom.onrender.com';
  static const String apiBaseUrl = '$backendUrl/api';

  /// Web UI reference host (optional).
  static const String frontendUrl = 'https://lumoroom.onrender.com';

  static const String oauthReturnUrl = 'glowcast://oauth-complete';
  static const String deepLinkScheme = 'glowcast';
  static const String altDeepLinkScheme = 'apservices';
  /// Your own backend — full read/write for testing.
  static const bool readOnlyMode = false;

  /// One-tap guest tester login (seed user on production API).
  static const bool guestTestingEnabled = true;
  static const String guestTestEmail = 'customer1.test@apservices.com';
  static const String guestTestPassword = 'password123';

  /// Show a menu to jump to every screen without hunting through the app.
  static const bool showScreenExplorer = true;

  static String oauthUrl(String provider) =>
      '$backendUrl/auth/$provider?role=customer&app_redirect=${Uri.encodeComponent(oauthReturnUrl)}';
}
