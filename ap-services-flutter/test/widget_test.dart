import 'package:flutter_test/flutter_test.dart';
import 'package:glowcast/app.dart';
import 'package:glowcast/services/auth_service.dart';

void main() {
  testWidgets('GlowCast splash shows app name', (WidgetTester tester) async {
    final auth = AuthService();
    await auth.initialize();
    await tester.pumpWidget(GlowCastApp(appState: AppState(auth)));
    await tester.pump();

    expect(find.text('GlowCast'), findsOneWidget);
  });
}
