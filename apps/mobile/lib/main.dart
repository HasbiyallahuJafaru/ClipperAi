import 'dart:io';

import 'package:app_links/app_links.dart';
import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'home.dart';
import 'welcome.dart';

/// Clerk's publishable key (public by design): `--dart-define=CLERK_PUBLISHABLE_KEY=pk_...`.
const clerkKey = String.fromEnvironment('CLERK_PUBLISHABLE_KEY');

/// The website: plans and payment live there, never in the app (app store rules).
const webUrl = String.fromEnvironment('WEB_URL', defaultValue: 'https://ytclipper.xyz');

/// Where Google and Apple sign-in come back to: the scheme is declared in AndroidManifest.xml and handed to Clerk as
/// the redirect, so sign-in happens in the phone's browser (already signed in) instead of a web view in the app.
final ssoCallback = Uri.parse('xyz.ytclipper.app://sso-callback');

final clerkConfig = ClerkAuthConfig(
  publishableKey: clerkKey,
  redirectionGenerator: (context, strategy) => strategy.isSSO ? ssoCallback : null,
  deepLinkStream: AppLinks().uriLinkStream,
);

void main() {
  if (clerkKey.isEmpty || apiUrl.isEmpty) {
    throw StateError('build with --dart-define=CLERK_PUBLISHABLE_KEY=pk_... and --dart-define=API_URL=https://...');
  }
  runApp(const App());
}

// The website's tokens (apps/website/app/globals.css, DESIGN.md). Light only.
const ground = Color(0xFFF4F6FA), surface = Colors.white, ink = Color(0xFF0A1022), muted = Color(0xFF5A6377);
const line = Color(0xFFE5E8EF), lineStrong = Color(0xFFD3D9E3), accent = Color(0xFF2355F5);
const accentSoft = Color(0xFFEBF0FF), accentInk = Color(0xFF1A3FB8), danger = Color(0xFFC0262D);
const dangerSoft = Color(0xFFFDEEEE);

/// Cards rest on the ground; bars and sheets float above it (DESIGN.md: a shadow or a ring, never both).
const cardShadow = [BoxShadow(color: Color(0x0D101830), blurRadius: 6, offset: Offset(0, 2))];
const floatShadow = [BoxShadow(color: Color(0x1A101830), blurRadius: 24, offset: Offset(0, 8))];

// One radius system: pills for controls, 12 for fields, 16 for cards, 24 for panels and sheets.
const fieldRadius = BorderRadius.all(Radius.circular(12));
const cardRadius = BorderRadius.all(Radius.circular(16));
const panelRadius = BorderRadius.all(Radius.circular(24));

final theme = ThemeData(
  fontFamily: 'Geist',
  scaffoldBackgroundColor: ground,
  colorScheme: const ColorScheme.light(
    primary: accent, onPrimary: Colors.white, primaryContainer: accentSoft, onPrimaryContainer: accentInk,
    secondaryContainer: accentSoft, onSecondaryContainer: accentInk, // selected segments and chips: pale blue, not teal
    surface: surface, onSurface: ink, onSurfaceVariant: muted, outline: lineStrong, outlineVariant: line,
    error: danger, errorContainer: dangerSoft,
  ),
  textTheme: const TextTheme(
    headlineLarge: TextStyle(fontSize: 32, height: 1.08, fontWeight: FontWeight.w600, letterSpacing: -1.1, color: ink),
    headlineSmall: TextStyle(fontSize: 22, height: 1.15, fontWeight: FontWeight.w600, letterSpacing: -0.6, color: ink),
    titleLarge: TextStyle(fontSize: 19, fontWeight: FontWeight.w600, letterSpacing: -0.5, color: ink),
    titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, letterSpacing: -0.3, color: ink),
    titleSmall: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500, color: ink),
    bodyLarge: TextStyle(fontSize: 16, height: 1.45, color: ink),
    bodyMedium: TextStyle(fontSize: 15, height: 1.45, color: ink),
    bodySmall: TextStyle(fontSize: 13.5, height: 1.4, color: muted),
    labelLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
    labelMedium: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: muted),
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: ground, foregroundColor: ink, scrolledUnderElevation: 0, centerTitle: false,
    titleTextStyle: TextStyle(fontFamily: 'Geist', fontSize: 19, fontWeight: FontWeight.w600, color: ink, letterSpacing: -0.5),
  ),
  filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
    shape: const StadiumBorder(), minimumSize: const Size(0, 48),
    padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 14),
    textStyle: const TextStyle(fontFamily: 'Geist', fontSize: 15, fontWeight: FontWeight.w500),
  )),
  outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(
    shape: const StadiumBorder(), foregroundColor: ink, side: const BorderSide(color: lineStrong),
    minimumSize: const Size(0, 48), padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
    textStyle: const TextStyle(fontFamily: 'Geist', fontSize: 15, fontWeight: FontWeight.w500),
  )),
  textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(
    foregroundColor: accentInk, minimumSize: const Size(0, 44), shape: const StadiumBorder(),
    textStyle: const TextStyle(fontFamily: 'Geist', fontSize: 15, fontWeight: FontWeight.w500),
  )),
  cardTheme: const CardThemeData(
    color: surface, elevation: 0, margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(borderRadius: cardRadius, side: BorderSide(color: line)),
  ),
  inputDecorationTheme: const InputDecorationTheme(
    filled: true, fillColor: surface, hintStyle: TextStyle(color: muted),
    border: OutlineInputBorder(borderRadius: fieldRadius, borderSide: BorderSide(color: lineStrong)),
    enabledBorder: OutlineInputBorder(borderRadius: fieldRadius, borderSide: BorderSide(color: lineStrong)),
    focusedBorder: OutlineInputBorder(borderRadius: fieldRadius, borderSide: BorderSide(color: accent, width: 1.5)),
  ),
  bottomSheetTheme: const BottomSheetThemeData(
    backgroundColor: surface, surfaceTintColor: surface,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
  ),
  dialogTheme: const DialogThemeData(
    backgroundColor: surface, surfaceTintColor: surface,
    shape: RoundedRectangleBorder(borderRadius: panelRadius),
  ),
  progressIndicatorTheme: const ProgressIndicatorThemeData(color: accent, linearTrackColor: accentSoft),
  snackBarTheme: const SnackBarThemeData(
    backgroundColor: ink, behavior: SnackBarBehavior.floating,
    contentTextStyle: TextStyle(fontFamily: 'Geist', color: Colors.white, fontSize: 14.5),
  ),
  splashFactory: InkSparkle.splashFactory,
  extensions: [ClerkThemeExtension(colors: const ClerkThemeColors(
    background: surface, altBackground: ground, borderSide: lineStrong, text: ink, icon: muted,
    lightweightText: muted, error: danger, accent: accent,
  ))],
);

void toast(BuildContext context, Object message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$message')));

/// Opens a link in the phone's browser (the website's plans, Buffer, a published post).
Future<void> openLink(BuildContext context, String url) async {
  final messenger = ScaffoldMessenger.of(context);
  if (!await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication)) {
    messenger.showSnackBar(const SnackBar(content: Text("Couldn't open that link.")));
  }
}

/// The phone's time zone name for the content calendar, e.g. Africa/Lagos.
Future<String> timezone() async => (await FlutterTimezone.getLocalTimezone()).identifier;

/// What other apps share to YT-Clipper: the share that opened the app, then any while it runs.
// ponytail: a share that arrives while signed out is dropped; keep it until sign-in if people hit that
Stream<Shared> shares() async* {
  final sharing = ReceiveSharingIntent.instance;
  Iterable<Shared> read(List<SharedMediaFile> files) => files.map((file) => switch (file.type) {
        SharedMediaType.video => (link: null, video: File(file.path)),
        SharedMediaType.file when (file.mimeType ?? '').startsWith('video/') => (link: null, video: File(file.path)),
        _ => (link: sharedLink(file.path), video: null),
      }).where((item) => item.link != null || item.video != null);
  yield* Stream.fromIterable(read(await sharing.getInitialMedia()));
  sharing.reset();
  await for (final files in sharing.getMediaStream()) {
    yield* Stream.fromIterable(read(files));
  }
}

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'YT-Clipper',
        theme: theme,
        debugShowCheckedModeBanner: false,
        builder: ClerkAuth.materialAppBuilder(config: clerkConfig),
        home: ClerkAuthBuilder(
          signedInBuilder: (context, auth) => HomeShell(
            api: Api(() async => (await auth.sessionToken()).jwt), shared: shares(), timezone: timezone,
          ),
          signedOutBuilder: (context, auth) => const WelcomePage(),
        ),
      );
}

/// The website's logo: a blue tile with a white phone, and the name.
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 28, this.showName = true, this.color = ink});
  final double size;
  final bool showName;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: size, height: size, alignment: Alignment.center,
          decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(size / 4)),
          child: Container(
            width: size * 0.35, height: size * 0.625, alignment: const Alignment(0, 0.55),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(size * 0.08)),
            child: Container(
              width: size * 0.19, height: size * 0.082,
              decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(size * 0.043)),
            ),
          ),
        ),
        if (showName) ...[
          SizedBox(width: size * 0.29),
          Text('YT-Clipper', style: TextStyle(
            fontSize: size * 0.61, fontWeight: FontWeight.w600, letterSpacing: size * -0.012, color: color)),
        ],
      ]);
}

/// Headings with their key words in blue italic serif, like the website's `<em>`.
class Heading extends StatelessWidget {
  const Heading({super.key, required this.before, required this.accent, this.size = 28, this.center = false, this.color = ink});
  final String before, accent;
  final double size;
  final bool center;
  final Color color;

  @override
  Widget build(BuildContext context) => Text.rich(
        TextSpan(style: TextStyle(fontSize: size, height: 1.1, fontWeight: FontWeight.w600, letterSpacing: -0.035 * size, color: color), children: [
          TextSpan(text: before),
          TextSpan(text: accent, style: TextStyle(
            fontFamily: 'InstrumentSerif', fontStyle: FontStyle.italic, fontSize: size * 1.12, fontWeight: FontWeight.w400,
            letterSpacing: 0, color: color == ink ? const Color(0xFF2355F5) : color, // the file-level `accent` is shadowed by the field
          )),
        ]),
        textAlign: center ? TextAlign.center : TextAlign.start,
      );
}

/// The sky photo behind the top of a screen, fading into the ground colour like the website's page heroes.
class SkyBackdrop extends StatelessWidget {
  const SkyBackdrop({super.key, this.height = 320});
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: height,
        child: Stack(fit: StackFit.expand, children: [
          Image.asset('assets/sky.jpg', fit: BoxFit.cover, alignment: const Alignment(0, -0.5)),
          const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0x26F4F6FA), Color(0x80F4F6FA), ground], stops: [0, 0.55, 1],
          ))),
        ]),
      );
}
