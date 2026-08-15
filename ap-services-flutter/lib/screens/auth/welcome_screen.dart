import 'package:flutter/material.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:provider/provider.dart';

import '../../app.dart';
import '../../config/app_config.dart';
import '../../config/theme.dart';
import '../../services/auth_service.dart';
import '../../widgets/glowcast_ui.dart';
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
      body: Container(
        decoration: const BoxDecoration(gradient: GlowTheme.splashGradient),
        child: SafeArea(
          child: Column(
            children: [
              const ReadOnlyBanner(),
              Expanded(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(24, 16, 24, 32),
                  child: Column(
                    children: [
                      const SizedBox(height: 24),
                      const GlowBrandMark(size: 88, showLabel: true),
                      const SizedBox(height: 12),
                      Text(
                        'Live social, reimagined',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.78),
                          fontSize: 15,
                          height: 1.4,
                        ),
                      ),
                      const SizedBox(height: 36),
                      _AuthCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_error != null)
                              Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: Text(_error!, style: const TextStyle(color: GlowTheme.accentLive)),
                              ),
                            _OAuthButton(
                              label: 'Continue with Google',
                              icon: Icons.g_mobiledata_rounded,
                              onPressed: _busy ? null : () => _oauth('google'),
                            ),
                            const SizedBox(height: 10),
                            _OAuthButton(
                              label: 'Continue with Facebook',
                              icon: Icons.facebook_rounded,
                              tint: const Color(0xFF1877F2),
                              onPressed: _busy ? null : () => _oauth('facebook'),
                            ),
                            const SizedBox(height: 10),
                            _OAuthButton(
                              label: 'Continue with GitHub',
                              icon: Icons.code_rounded,
                              tint: const Color(0xFF24292F),
                              onPressed: _busy ? null : () => _oauth('github'),
                            ),
                            const SizedBox(height: 16),
                            OutlinedButton(
                              onPressed: _busy ? null : () => Navigator.of(context).pushNamed('/login'),
                              child: const Text('Sign in with email'),
                            ),
                            if (AppConfig.guestTestingEnabled) ...[
                              const SizedBox(height: 12),
                              ElevatedButton.icon(
                                onPressed: _busy ? null : _guestLogin,
                                icon: const Icon(Icons.play_arrow_rounded),
                                label: const Text('Quick demo login'),
                              ),
                            ],
                            if (_busy) ...[
                              const SizedBox(height: 20),
                              const Center(
                                child: CircularProgressIndicator(color: GlowTheme.brand),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      Text(
                        'Live · Party · Chat · Gifts · Creators',
                        style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AuthCard extends StatelessWidget {
  const _AuthCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: GlowTheme.creamSurface,
        borderRadius: GlowTheme.radiusLg,
        boxShadow: GlowTheme.cardShadow,
      ),
      child: child,
    );
  }
}

class _OAuthButton extends StatelessWidget {
  const _OAuthButton({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.tint,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final Color? tint;

  @override
  Widget build(BuildContext context) {
    final color = tint ?? GlowTheme.textPrimary;
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(
          foregroundColor: color,
          side: BorderSide(color: tint?.withValues(alpha: 0.25) ?? GlowTheme.border),
          backgroundColor: tint != null ? tint!.withValues(alpha: 0.06) : GlowTheme.surfaceMuted,
        ),
        onPressed: onPressed,
        icon: Icon(icon, size: 22),
        label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
      ),
    );
  }
}
