import 'package:flutter/material.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:provider/provider.dart';

import '../../app.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../services/auth_service.dart';
import '../../widgets/read_only_banner.dart';

class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _guestLogin() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AuthService>().loginAsGuest();
      await context.read<AppState>().syncPushToken();
      if (mounted) Navigator.of(context).pushReplacementNamed('/home');
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _oauth(String provider) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    final auth = context.read<AuthService>();
    try {
      final result = await FlutterWebAuth2.authenticate(
        url: auth.oauthUrl(provider),
        callbackUrlScheme: AppConfig.deepLinkScheme,
      );

      final uri = Uri.parse(result);
      final code = uri.queryParameters['code'];
      if (code == null || code.isEmpty) {
        throw Exception('OAuth did not return a code');
      }
      await auth.exchangeOAuthCode(code);
      await context.read<AppState>().syncPushToken();
      if (mounted) {
        Navigator.of(context).pushReplacementNamed('/home');
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const ReadOnlyBanner(),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: _welcomeBody(context),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _welcomeBody(BuildContext context) {
    return [
              const SizedBox(height: 32),
              Image.asset('assets/images/logo.png', width: 96, height: 96,
                  errorBuilder: (_, __, ___) => const Icon(Icons.live_tv, size: 96, color: GlowTheme.gold500)),
              const SizedBox(height: 16),
              Text(
                AppConfig.appName,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: GlowTheme.textPrimary,
                    ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Go live, join party rooms, send gifts & connect.',
                textAlign: TextAlign.center,
                style: TextStyle(color: GlowTheme.textSecondary),
              ),
              const SizedBox(height: 32),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(_error!, style: const TextStyle(color: Colors.red)),
                ),
              _OAuthButton(
                label: 'Continue with Google',
                icon: Icons.g_mobiledata_rounded,
                color: Colors.white,
                textColor: Colors.black87,
                onPressed: _busy ? null : () => _oauth('google'),
              ),
              const SizedBox(height: 12),
              _OAuthButton(
                label: 'Continue with Facebook',
                icon: Icons.facebook,
                color: const Color(0xFF1877F2),
                onPressed: _busy ? null : () => _oauth('facebook'),
              ),
              const SizedBox(height: 12),
              _OAuthButton(
                label: 'Continue with GitHub',
                icon: Icons.code,
                color: const Color(0xFF24292F),
                onPressed: _busy ? null : () => _oauth('github'),
              ),
              const SizedBox(height: 24),
              OutlinedButton(
                onPressed: _busy ? null : () => Navigator.of(context).pushNamed('/login'),
                child: const Text('Sign in with email'),
              ),
              if (AppConfig.guestTestingEnabled) ...[
                const SizedBox(height: 12),
                ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: GlowTheme.gold500,
                    foregroundColor: Colors.white,
                  ),
                  onPressed: _busy ? null : _guestLogin,
                  icon: const Icon(Icons.play_arrow_rounded),
                  label: const Text('Guest test login'),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Email login pre-filled · browse all screens safely',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: GlowTheme.textSecondary),
                ),
              ],
              if (_busy) ...[
                const SizedBox(height: 24),
                const CircularProgressIndicator(color: GlowTheme.gold500),
              ],
    ];
  }
}

class _OAuthButton extends StatelessWidget {
  const _OAuthButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
    this.textColor = Colors.white,
  });

  final String label;
  final IconData icon;
  final Color color;
  final Color textColor;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        style: ElevatedButton.styleFrom(
          backgroundColor: color,
          foregroundColor: textColor,
          elevation: color == Colors.white ? 1 : 0,
        ),
        onPressed: onPressed,
        icon: Icon(icon),
        label: Text(label),
      ),
    );
  }
}
