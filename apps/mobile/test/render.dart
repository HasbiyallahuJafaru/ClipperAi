// Throwaway: renders each screen at phone size with the real fonts, so the design can be looked at without a device.
// Run: flutter test test/render_test.dart --update-goldens   (pictures land in test/goldens/)
import 'dart:convert';
import 'dart:io';

import 'package:app/account.dart';
import 'package:app/api.dart';
import 'package:app/home.dart';
import 'package:app/main.dart';
import 'package:app/publish.dart';
import 'package:app/screens.dart';
import 'package:app/welcome.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:path/path.dart' as p;

const clip = {
  'idx': 1, 'hook': 'Nobody tells founders this', 'score': 87, 'start_s': 725.0, 'end_s': 768.0,
  'reason': 'A clear, surprising answer with a real number in it', 'hashtags': ['startups', 'founders'],
  'description': 'Why most teams stall at the same point, and the one change that moves them.',
  'title': 'Why most startups stall at ten people', 'review': 'approved',
  'video_url': null, 'thumbnail_url': null,
  'posts': {
    'tiktok': 'Most startups stall at ten people. Here is the fix #founders #startups',
    'instagram': 'The wall every founder hits at ten people.',
    'youtube': 'Why teams stall at ten people, and what to change first.',
  },
};

Api fakeApi(Object? Function(String method, String path) answer) => Api(
      () async => 'jwt',
      base: 'https://api.test',
      client: MockClient((request) async {
        final body = answer(request.method, request.url.path);
        return http.Response(body == null ? '' : jsonEncode(body), 200, headers: {'content-type': 'application/json'});
      }),
    );

/// Assets straight off disk, so the sky photo shows up in the pictures.
class DiskBundle extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async {
    final file = File(key);
    if (file.existsSync()) return ByteData.view((await file.readAsBytes()).buffer);
    return rootBundle.load(key); // the manifest and anything else comes from the usual place
  }
}

Future<void> shot(WidgetTester tester, String name, Widget home, {Size size = const Size(390, 844)}) async {
  await tester.binding.setSurfaceSize(size);
  tester.view.devicePixelRatio = 2;
  await tester.pumpWidget(MaterialApp(
    theme: theme,
    debugShowCheckedModeBanner: false,
    home: Account(name: 'Ada Nwosu', imageUrl: null, child: home),
  ));
  // real async, so the photo and any network pictures actually decode before the shot
  await tester.runAsync(() async {
    await tester.pump();
    await Future<void>.delayed(const Duration(milliseconds: 400));
  });
  await tester.pump();
  await tester.pump(const Duration(seconds: 1));
  await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$name.png'));
}

Widget shell(Widget page, int tab) => Scaffold(body: page, bottomNavigationBar: NavBar(current: tab, onChanged: (_) {}));

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final icons = p.join(
      Platform.environment['LOCALAPPDATA']!, 'Pub', 'Cache', 'hosted', 'pub.dev', 'phosphor_icons-3.0.1', 'lib', 'fonts');
    for (final family in {
      'Geist': ['fonts/Geist-Regular.ttf', 'fonts/Geist-Medium.ttf', 'fonts/Geist-SemiBold.ttf'],
      'InstrumentSerif': ['fonts/InstrumentSerif-Italic.ttf'],
      'packages/phosphor_icons/PhosphorRegular': [p.join(icons, 'Phosphor.ttf')],
      'packages/phosphor_icons/PhosphorBold': [p.join(icons, 'Phosphor-Bold.ttf')],
      'packages/phosphor_icons/PhosphorFill': [p.join(icons, 'Phosphor-Fill.ttf')],
    }.entries) {
      final loader = FontLoader(family.key);
      for (final path in family.value) {
        loader.addFont(File(path).readAsBytes().then((bytes) => ByteData.view(bytes.buffer)));
      }
      await loader.load();
    }
  });

  testWidgets('welcome', (tester) => shot(tester, 'welcome', const WelcomePage()));

  testWidgets('projects', (tester) async {
    final api = fakeApi((method, path) => [
          {'id': 'p1', 'source': 'https://youtu.be/9bZkp7q19f0', 'status': 'completed', 'message': 'Ready.',
            'clip_count': 12, 'created_at': '2026-09-14T09:00:00Z'},
          {'id': 'p2', 'source': 'https://youtu.be/dQw4w9WgXcQ', 'status': 'rendering', 'message': 'Creating your clips...',
            'progress': 62, 'created_at': '2026-09-16T09:00:00Z'},
          {'id': 'p3', 'source': 'upload:abc', 'status': 'completed', 'message': 'Ready.', 'clip_count': 7,
            'created_at': '2026-09-12T09:00:00Z'},
          {'id': 'p4', 'source': 'https://vimeo.com/76979871', 'status': 'failed', 'message': 'Something went wrong.',
            'created_at': '2026-09-10T09:00:00Z'},
        ]);
    await shot(tester, 'projects', shell(ProjectsPage(api: api), 0));
  });

  testWidgets('projects empty', (tester) async {
    final api = fakeApi((method, path) => []);
    await shot(tester, 'projects-empty', shell(ProjectsPage(api: api), 0));
  });

  testWidgets('project working', (tester) async {
    final api = fakeApi((method, path) => {
          'id': 'p2', 'source': 'https://youtu.be/dQw4w9WgXcQ', 'status': 'analyzing', 'message': 'Finding your strongest moments...',
          'detail': 'reading the transcript', 'progress': 48, 'thumbnail': null, 'cancel_requested': false,
          'created_at': '2026-09-16T09:00:00Z',
        });
    await shot(tester, 'project-working', ProjectPage(api: api, id: 'p2'));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('project clips', (tester) async {
    final api = fakeApi((method, path) => path.endsWith('publications')
        ? {'publications': [
            {'id': 'pub1', 'clip_idx': 1, 'service': 'tiktok', 'channel_name': 'The Micro-Fix', 'status': 'scheduled',
              'due_at': '2026-09-18T17:00:00Z'},
          ], 'schedule_until': '2026-10-10T08:00:00Z'}
        : {
            'id': 'p1', 'source': 'https://youtu.be/9bZkp7q19f0', 'status': 'completed', 'message': 'Ready.',
            'created_at': '2026-09-14T09:00:00Z', 'files_expire_at': '2026-10-10T08:00:00Z',
            'clips': [clip, {...clip, 'idx': 2, 'review': 'pending', 'title': 'The ten-person wall', 'score': 81}],
          });
    await shot(tester, 'project-clips', ProjectPage(api: api, id: 'p1'));
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('publishing', (tester) async {
    final api = fakeApi((method, path) => [
          {'id': 'c1', 'service': 'tiktok', 'name': 'tt', 'displayName': 'The Micro-Fix', 'usable': true},
          {'id': 'c2', 'service': 'instagram', 'name': 'ig', 'displayName': 'micro.fix', 'usable': false, 'isDisconnected': true},
          {'id': 'c3', 'service': 'youtube', 'name': 'yt', 'displayName': 'Micro-Fix Shorts', 'usable': true},
        ]);
    await shot(tester, 'publishing', shell(PublishingPage(api: api), 1));
  });

  testWidgets('plan', (tester) async {
    final api = fakeApi((method, path) => {
          'plans': [
            {'id': 'creator', 'name': 'Creator', 'price_cents': 1500, 'videos': 5, 'minutes': 300, 'clips': 50},
            {'id': 'pro', 'name': 'Pro', 'price_cents': 3900, 'videos': 15, 'minutes': 900, 'clips': 150},
            {'id': 'business', 'name': 'Business', 'price_cents': 9900, 'videos': null, 'minutes': 3000, 'clips': 500},
          ],
          'subscription': {'plan': 'creator', 'price_cents': 1500, 'started_at': '2026-09-01T08:00:00Z', 'status': 'active'},
          'usage': {'videos': 3, 'minutes': 142, 'clips': 31},
          'history': [
            {'id': 's1', 'plan': 'creator', 'price_cents': 1500, 'charged_cents': 0, 'status': 'active', 'started_at': '2026-09-01T08:00:00Z'},
          ],
        });
    await shot(tester, 'plan', shell(PlanPage(api: api), 2));
  });

  testWidgets('new project sheet', (tester) async {
    final api = fakeApi((method, path) => null);
    await shot(tester, 'new-project', Scaffold(
      backgroundColor: ground,
      body: Align(alignment: Alignment.bottomCenter, child: Material(
        color: surface,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: NewProject(api: api),
      )),
    ));
  });

  testWidgets('publish sheet', (tester) async {
    final api = fakeApi((method, path) => [
          {'id': 'c1', 'service': 'tiktok', 'name': 'tt', 'displayName': 'The Micro-Fix', 'usable': true},
          {'id': 'c2', 'service': 'instagram', 'name': 'ig', 'displayName': 'micro.fix', 'usable': false, 'isDisconnected': true},
          {'id': 'c3', 'service': 'youtube', 'name': 'yt', 'displayName': 'Micro-Fix Shorts', 'usable': true},
        ]);
    await shot(tester, 'publish-sheet', Scaffold(
      backgroundColor: ground,
      body: Align(alignment: Alignment.bottomCenter, child: Material(
        color: surface,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
        child: PublishSheet(api: api, projectId: 'p1', clip: clip, until: '2026-10-10T08:00:00Z'),
      )),
    ));
  });

  testWidgets('calendar', (tester) async {
    final api = fakeApi((method, path) => switch (path) {
          '/api/publishing/channels' => [
              {'id': 'c1', 'service': 'tiktok', 'name': 'tt', 'displayName': 'The Micro-Fix', 'usable': true},
              {'id': 'c3', 'service': 'youtube', 'name': 'yt', 'displayName': 'Micro-Fix Shorts', 'usable': true},
            ],
          '/api/projects/p1' => {
              'id': 'p1', 'source': 'https://youtu.be/9bZkp7q19f0', 'status': 'completed', 'message': 'Ready.',
              'clips': [clip, {...clip, 'idx': 2, 'title': 'The ten-person wall', 'review': 'approved'}],
            },
          _ => {'publications': [
              {'id': 'pub1', 'clip_idx': 1, 'service': 'tiktok', 'channel_name': 'The Micro-Fix', 'status': 'scheduled',
                'due_at': '2026-09-18T17:00:00Z'},
              {'id': 'pub2', 'clip_idx': 1, 'service': 'youtube', 'channel_name': 'Micro-Fix Shorts', 'status': 'sent',
                'sent_at': '2026-09-17T09:00:00Z', 'external_link': 'https://youtube.com/shorts/x'},
            ], 'schedule_until': '2026-10-10T08:00:00Z'},
        });
    await shot(tester, 'calendar', CalendarPage(api: api, projectId: 'p1', timezone: () async => 'Africa/Lagos'));
    await tester.pumpWidget(const SizedBox());
  });
}
