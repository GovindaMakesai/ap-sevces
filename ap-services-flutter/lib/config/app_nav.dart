import 'package:flutter/material.dart';

import '../services/deep_link_service.dart';

/// Root navigator — used by push notifications and OAuth deep links.
final rootNavigatorKey = GlobalKey<NavigatorState>();

void navigateDeepLink(DeepLinkTarget target) {
  final nav = rootNavigatorKey.currentState;
  if (nav == null) return;
  nav.pushNamed(target.route, arguments: target.arguments);
}
