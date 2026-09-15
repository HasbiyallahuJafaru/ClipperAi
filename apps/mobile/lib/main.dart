import 'dart:io';

import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:receive_sharing_intent/receive_sharing_intent.dart';

import 'api.dart';
import 'screens.dart';

/// Clerk's publishable key (public by design): `--dart-define=CLERK_PUBLISHABLE_KEY=pk_...`.
const clerkKey = String.fromEnvironment('CLERK_PUBLISHABLE_KEY');

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

final theme = ThemeData(
  fontFamily: 'Geist',
  scaffoldBackgroundColor: ground,
  colorScheme: const ColorScheme.light(
    primary: accent, onPrimary: Colors.white, primaryContainer: accentSoft, onPrimaryContainer: accentInk,
    secondaryContainer: accentSoft, onSecondaryContainer: accentInk, // selected segments and chips: pale blue, not teal
    surface: surface, onSurface: ink, onSurfaceVariant: muted, outline: lineStrong, outlineVariant: line,
    error: danger, errorContainer: dangerSoft,
  ),
  appBarTheme: const AppBarTheme(
    backgroundColor: ground, foregroundColor: ink, scrolledUnderElevation: 0, centerTitle: false,
    titleTextStyle: TextStyle(fontFamily: 'Geist', fontSize: 20, fontWeight: FontWeight.w600, color: ink, letterSpacing: -0.6),
  ),
  filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(
    shape: const StadiumBorder(), padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
    textStyle: const TextStyle(fontFamily: 'Geist', fontSize: 15, fontWeight: FontWeight.w500),
  )),
  outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(
    shape: const StadiumBorder(), foregroundColor: ink, side: const BorderSide(color: lineStrong),
    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
    textStyle: const TextStyle(fontFamily: 'Geist', fontSize: 15, fontWeight: FontWeight.w500),
  )),
  cardTheme: const CardThemeData(
    color: surface, elevation: 0, margin: EdgeInsets.zero,
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(16)), side: BorderSide(color: line)),
  ),
  inputDecorationTheme: const InputDecorationTheme(
    filled: true, fillColor: surface, hintStyle: TextStyle(color: muted),
    border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12)), borderSide: BorderSide(color: lineStrong)),
    enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12)), borderSide: BorderSide(color: lineStrong)),
    focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12)), borderSide: BorderSide(color: accent, width: 1.5)),
  ),
  floatingActionButtonTheme: const FloatingActionButtonThemeData(elevation: 2, highlightElevation: 4),
  progressIndicatorTheme: const ProgressIndicatorThemeData(color: accent, linearTrackColor: accentSoft),
  snackBarTheme: const SnackBarThemeData(backgroundColor: ink, behavior: SnackBarBehavior.floating),
  extensions: [ClerkThemeExtension(colors: const ClerkThemeColors(
    background: surface, altBackground: ground, borderSide: lineStrong, text: ink, icon: muted,
    lightweightText: muted, error: danger, accent: accent,
  ))],
);

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
        builder: ClerkAuth.materialAppBuilder(config: ClerkAuthConfig(publishableKey: clerkKey)),
        home: ClerkAuthBuilder(
          signedInBuilder: (context, auth) => ProjectsPage(
            api: Api(() async => (await auth.sessionToken()).jwt), shared: shares(), timezone: timezone,
          ),
          signedOutBuilder: (context, auth) => const SignInPage(),
        ),
      );
}

/// The website's sign-in page: Clerk's card on the sky.
class SignInPage extends StatelessWidget {
  const SignInPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(children: [
          Positioned.fill(child: Image.asset('assets/sky.jpg', fit: BoxFit.cover, alignment: const Alignment(0, -0.6))),
          const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0x26F4F6FA), Color(0x80F4F6FA), ground], stops: [0, 0.6, 1],
          )))),
          SafeArea(child: ListView(padding: const EdgeInsets.fromLTRB(16, 32, 16, 32), children: [
            const Center(child: Logo()),
            const SizedBox(height: 28),
            const Heading(before: 'Turn one video into ', accent: 'a month of content', size: 34, center: true),
            const SizedBox(height: 28),
            DecoratedBox(
              decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(18), boxShadow: const [
                BoxShadow(color: Color(0x0D101830), blurRadius: 6, offset: Offset(0, 2)),
                BoxShadow(color: Color(0x4D16328C), blurRadius: 80, spreadRadius: -28, offset: Offset(0, 40)),
              ]),
              child: const Padding(padding: EdgeInsets.all(8), child: ClerkAuthentication()),
            ),
          ])),
        ]),
      );
}

/// The website's logo: a blue tile with a white phone, and the name.
class Logo extends StatelessWidget {
  const Logo({super.key});

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 28, height: 28, alignment: Alignment.center,
          decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(7)),
          child: Container(
            width: 9.8, height: 17.5, alignment: const Alignment(0, 0.55),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(2.2)),
            child: Container(width: 5.3, height: 2.3, decoration: BoxDecoration(color: accent, borderRadius: BorderRadius.circular(1.2))),
          ),
        ),
        const SizedBox(width: 8),
        const Text('YT-Clipper', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: -0.34, color: ink)),
      ]);
}

/// Headings with their key words in blue italic serif, like the website's `<em>`.
class Heading extends StatelessWidget {
  const Heading({super.key, required this.before, required this.accent, this.size = 28, this.center = false});
  final String before, accent;
  final double size;
  final bool center;

  @override
  Widget build(BuildContext context) => Text.rich(
        TextSpan(style: TextStyle(fontSize: size, height: 1.08, fontWeight: FontWeight.w500, letterSpacing: -0.035 * size, color: ink), children: [
          TextSpan(text: before),
          TextSpan(text: accent, style: TextStyle(
            fontFamily: 'InstrumentSerif', fontStyle: FontStyle.italic, fontSize: size * 1.1, letterSpacing: 0, color: const Color(0xFF2355F5), // the file-level `accent` is shadowed by the field
          )),
        ]),
        textAlign: center ? TextAlign.center : TextAlign.start,
      );
}
