import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class GlowTheme {
  static const creamBg = Color(0xFFFAF6EE);
  static const creamSurface = Color(0xFFFDF9F0);
  static const gold500 = Color(0xFFC9A227);
  static const gold600 = Color(0xFFB8921F);
  static const gold100 = Color(0xFFF5E6C8);
  static const orangeCta = Color(0xFFF59E0B);
  static const purple500 = Color(0xFF8B5CF6);
  static const purple600 = Color(0xFF7C3AED);
  static const vipBg = Color(0xFF120C24);
  static const vipCard = Color(0xFF2A244D);
  static const liveDark = Color(0xFF07080C);
  static const textPrimary = Color(0xFF1A1A1A);
  static const textSecondary = Color(0xFF6B7280);

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: gold500,
        primary: gold500,
        secondary: purple500,
        surface: creamSurface,
      ),
      scaffoldBackgroundColor: creamBg,
      appBarTheme: const AppBarTheme(
        backgroundColor: creamSurface,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: true,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: creamSurface,
        selectedItemColor: gold500,
        unselectedItemColor: textSecondary,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: orangeCta,
        foregroundColor: Colors.white,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: gold500,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: textPrimary,
        displayColor: textPrimary,
      ),
    );
  }

  static ThemeData liveRoom() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: liveDark,
      colorScheme: const ColorScheme.dark(
        primary: gold500,
        secondary: purple500,
        surface: liveDark,
      ),
    );
  }
}
