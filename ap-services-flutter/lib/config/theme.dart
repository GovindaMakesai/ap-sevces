import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Glowcast design system — modern live-social UI (distinct from legacy gold/cream apps).
class GlowTheme {
  // Core brand
  static const brand = Color(0xFF6366F1);
  static const brandDark = Color(0xFF4F46E5);
  static const brandLight = Color(0xFFEEF2FF);
  static const accentLive = Color(0xFFEF4444);
  static const accentParty = Color(0xFF8B5CF6);
  static const accentTeal = Color(0xFF14B8A6);
  static const border = Color(0xFFE2E8F0);
  static const surfaceMuted = Color(0xFFF1F5F9);

  // Legacy aliases — keeps existing screens working while using the new palette
  static const gold500 = brand;
  static const gold600 = brandDark;
  static const gold100 = brandLight;
  static const orangeCta = accentLive;
  static const purple500 = accentParty;
  static const purple600 = Color(0xFF7C3AED);
  static const creamBg = Color(0xFFF8FAFC);
  static const creamSurface = Color(0xFFFFFFFF);
  static const textPrimary = Color(0xFF0F172A);
  static const textSecondary = Color(0xFF64748B);
  static const textMuted = Color(0xFF94A3B8);

  static const liveDark = Color(0xFF09090B);
  static const vipBg = Color(0xFF0F172A);
  static const vipCard = Color(0xFF1E293B);

  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
  );

  static const LinearGradient liveGradient = LinearGradient(
    colors: [Color(0xFFEF4444), Color(0xFFDC2626)],
  );

  static const LinearGradient splashGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [Color(0xFF1E1B4B), Color(0xFF0F172A)],
  );

  static BorderRadius get radiusMd => BorderRadius.circular(16);
  static BorderRadius get radiusLg => BorderRadius.circular(20);

  static List<BoxShadow> get cardShadow => [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.06),
          blurRadius: 16,
          offset: const Offset(0, 4),
        ),
      ];

  static ThemeData light() {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: ColorScheme.fromSeed(
        seedColor: brand,
        primary: brand,
        secondary: accentParty,
        surface: creamSurface,
        onSurface: textPrimary,
      ),
      scaffoldBackgroundColor: creamBg,
      dividerColor: border,
      appBarTheme: const AppBarTheme(
        backgroundColor: creamSurface,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: true,
        scrolledUnderElevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 17,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
      ),
      cardTheme: CardThemeData(
        color: creamSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: radiusMd,
          side: const BorderSide(color: border),
        ),
        margin: EdgeInsets.zero,
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: brand,
        unselectedLabelColor: textSecondary,
        indicatorColor: brand,
        dividerColor: border,
        labelStyle: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
        unselectedLabelStyle: TextStyle(fontWeight: FontWeight.w500, fontSize: 13),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: creamSurface,
        selectedItemColor: brand,
        unselectedItemColor: textMuted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: brand,
        foregroundColor: Colors.white,
        elevation: 2,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: creamSurface,
        hintStyle: const TextStyle(color: textMuted),
        labelStyle: const TextStyle(color: textSecondary),
        border: OutlineInputBorder(
          borderRadius: radiusMd,
          borderSide: const BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: radiusMd,
          borderSide: const BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: radiusMd,
          borderSide: const BorderSide(color: brand, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: brand,
          foregroundColor: Colors.white,
          elevation: 0,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: radiusMd),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: textPrimary,
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: border),
          shape: RoundedRectangleBorder(borderRadius: radiusMd),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: brand),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: brand,
        textColor: textPrimary,
        contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      ),
    );
    return base.copyWith(
      textTheme: base.textTheme.apply(
        bodyColor: textPrimary,
        displayColor: textPrimary,
        fontFamily: 'Roboto',
      ),
    );
  }

  static ThemeData liveRoom() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: liveDark,
      colorScheme: const ColorScheme.dark(
        primary: brand,
        secondary: accentParty,
        surface: liveDark,
      ),
    );
  }
}
