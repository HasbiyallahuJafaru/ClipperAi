import 'package:clerk_auth/clerk_auth.dart' as clerk;
import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'main.dart';

/// The first screen: the sky photo, the promise, and the two ways in. Google opens the phone's browser (where people
/// are already signed in) and comes back through the deep link; email uses Clerk's own card on the next screen.
class WelcomePage extends StatelessWidget {
  const WelcomePage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(children: [
          Positioned.fill(child: Image.asset('assets/sky.jpg', fit: BoxFit.cover, alignment: const Alignment(0, -0.3))),
          const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0x40101830), Color(0x0D101830), Color(0x00101830)], stops: [0, 0.5, 1],
          )))),
          Column(children: [
            Expanded(child: SafeArea(bottom: false, child: Center(child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 13, 22, 13),
                  decoration: const ShapeDecoration(color: Color(0xF2FFFFFF), shape: StadiumBorder(), shadows: floatShadow),
                  child: const Logo(size: 30),
                ),
                const SizedBox(height: 16),
                const Text('Turn long videos into short clips', style: TextStyle(
                  color: Colors.white, fontSize: 15, fontWeight: FontWeight.w500,
                  shadows: [Shadow(blurRadius: 14, color: Color(0x8C101830))],
                )),
              ],
            )))),
            DecoratedBox(
              decoration: const BoxDecoration(
                color: surface,
                borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                boxShadow: [BoxShadow(color: Color(0x1F101830), blurRadius: 48, offset: Offset(0, -14))],
              ),
              child: SafeArea(top: false, child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 32, 24, 18),
                child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Heading(before: 'One video,\n', accent: 'a month of content', size: 30, center: true),
                  const SizedBox(height: 12),
                  const Text(
                    'Clips cut to 9:16, captioned and ready to post, with the words written for every platform.',
                    textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 15, height: 1.45),
                  ),
                  const SizedBox(height: 26),
                  FilledButton(
                    style: FilledButton.styleFrom(backgroundColor: accent, foregroundColor: Colors.white),
                    onPressed: () => ClerkAuth.of(context, listen: false).ssoSignIn(context, clerk.Strategy.oauthGoogle),
                    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Container(
                        width: 22, height: 22, alignment: Alignment.center,
                        decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
                        child: Icon(PhosphorIconsBold.googleLogo, size: 13, color: accent),
                      ),
                      const SizedBox(width: 10),
                      const Text('Continue with Google'),
                    ]),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const EmailSignInPage())),
                    icon: Icon(PhosphorIconsRegular.envelopeSimple, size: 19, color: ink),
                    label: const Text('Continue with email'),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'New here? Either way makes your account. Plans are chosen on the website.',
                    textAlign: TextAlign.center, style: TextStyle(color: muted, fontSize: 12.5, height: 1.4),
                  ),
                ]),
              )),
            ),
          ]),
        ]),
      );
}

/// Clerk's own sign-in and sign-up card (email and password, or an emailed code) on the sky.
class EmailSignInPage extends StatelessWidget {
  const EmailSignInPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Stack(children: [
          const Positioned(top: 0, left: 0, right: 0, child: SkyBackdrop(height: 300)),
          SafeArea(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(children: [
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  tooltip: 'Back',
                  icon: Icon(PhosphorIconsBold.caretLeft, size: 20, color: ink),
                ),
                const Spacer(),
                const Logo(size: 24),
              ]),
            ),
            Expanded(child: ListView(padding: const EdgeInsets.fromLTRB(16, 20, 16, 32), children: [
              const Heading(before: 'Sign in to ', accent: 'YT-Clipper', size: 28, center: true),
              const SizedBox(height: 20),
              const DecoratedBox(
                decoration: BoxDecoration(color: surface, borderRadius: panelRadius, boxShadow: floatShadow),
                child: Padding(padding: EdgeInsets.all(8), child: ClerkAuthentication()),
              ),
            ])),
          ])),
        ]),
      );
}
