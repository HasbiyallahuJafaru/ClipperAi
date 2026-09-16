import 'dart:convert';
import 'dart:io';

import 'package:app/account.dart';
import 'package:app/api.dart';
import 'package:app/home.dart';
import 'package:app/main.dart';
import 'package:app/publish.dart';
import 'package:app/screens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const clip = {
  'idx': 1, 'hook': 'h', 'score': 87, 'reason': 'A clear, surprising answer', 'hashtags': ['startups'], 'description': '', 'title': 'Why most startups stall', 'review': 'pending',
  'posts': {'tiktok': 'Most startups stall here #founders', 'x': ''},
};

/// A fake backend: records requests and answers like apps/backend/api.py.
(Api, List<http.BaseRequest>) fakeApi(Future<http.StreamedResponse> Function(http.BaseRequest r, String body) answer) {
  final seen = <http.BaseRequest>[];
  final client = MockClient.streaming((request, stream) async {
    seen.add(request);
    return answer(request, utf8.decode(await stream.toBytes()));
  });
  return (Api(() async => 'jwt-1', client: client, base: 'https://api.test'), seen);
}

http.StreamedResponse json(Object? body, [int status = 200]) =>
    http.StreamedResponse(Stream.value(utf8.encode(body == null ? '' : jsonEncode(body))), status);

/// A page as the app shows it: the theme, the shell's surface, and an account for the top row.
Widget app(Widget home) => MaterialApp(
      theme: theme,
      home: Account(name: 'Ada Nwosu', imageUrl: null, child: Scaffold(body: home)),
    );

/// Scrolls the page until [finder] is on screen (the test window is shorter than a phone).
Future<void> reach(WidgetTester tester, Finder finder) async {
  await tester.scrollUntilVisible(finder, 150, scrollable: find.byType(Scrollable).first);
  await tester.pumpAndSettle();
}

void main() {
  test('every call carries the Clerk token and sends JSON', () async {
    final (api, seen) = fakeApi((r, body) async => json({'id': 'p1', 'echo': jsonDecode(body)}, 202));
    final project = await api.call('POST', '/projects', {'source': 'https://youtu.be/x'});
    expect(seen.single.url.toString(), 'https://api.test/api/projects');
    expect(seen.single.headers['Authorization'], 'Bearer jwt-1');
    expect(project['echo'], {'source': 'https://youtu.be/x'});
  });

  test("refusals surface the backend's message", () async {
    for (final (body, status, message) in [
      ({'detail': 'This month\'s allowance is used up.'}, 402, "This month's allowance is used up."),
      ({'detail': [{'msg': 'Value error, only public http(s) links'}]}, 422, 'only public http(s) links'),
      (null, 500, 'Something went wrong (500). Try again.'),
    ]) {
      final (api, _) = fakeApi((r, _) async => json(body, status));
      await expectLater(api.call('GET', '/projects'), throwsA(isA<ApiError>().having((e) => e.message, 'message', message)));
    }
  });

  test('no connection gives a readable message, not a crash', () async {
    final (api, _) = fakeApi((r, _) async => throw const SocketException('offline'));
    await expectLater(api.call('GET', '/projects'), throwsA(isA<ApiError>().having((e) => e.message, 'message', contains("Can't reach"))));
  });

  test('upload: ticket, then the file PUT to the signed link with progress', () async {
    final file = File('${Directory.systemTemp.path}/upload_test.mp4')..writeAsBytesSync(List.filled(200000, 7));
    String? putBody;
    final (api, seen) = fakeApi((r, body) async {
      if (r.method == 'PUT') {
        putBody = body;
        return json(null);
      }
      return json({'source': 'upload:abc', 'upload_url': 'https://storage.test/put', 'headers': {'Content-Type': 'video/mp4'}}, 201);
    });
    final progress = <double>[];
    expect(await api.upload(file, 'video/mp4', progress.add), 'upload:abc');
    expect(jsonDecode((seen[0] as http.Request).body), {'content_type': 'video/mp4', 'size': 200000});
    expect(seen[1].headers['Content-Type'], 'video/mp4');
    expect(seen[1].headers.containsKey('Authorization'), isFalse); // the signed link is the permission
    expect(putBody!.length, 200000);
    expect(progress.last, 1.0);
  });

  test('downloads: the zip from the API carries the token, a signed clip link does not', () async {
    final (api, seen) = fakeApi((r, _) async => json(null));
    final to = File('${Directory.systemTemp.path}/download_test.bin');
    await api.download('/projects/p1/package', to, signedIn: true);
    await api.download('https://storage.test/clip01.mp4', to);
    expect(seen[0].url.toString(), 'https://api.test/api/projects/p1/package');
    expect(seen[0].headers['Authorization'], 'Bearer jwt-1');
    expect(seen[1].url.toString(), 'https://storage.test/clip01.mp4');
    expect(seen[1].headers.containsKey('Authorization'), isFalse);
  });

  test('labels', () {
    expect(sourceLabel('upload:abc'), 'Uploaded video');
    expect(sourceLabel('https://www.youtube.com/watch?v=abc'), 'youtube.com/watch?v=abc');
    expect(plural(1, 'clip'), '1 clip');
    expect(plural(3, 'clip'), '3 clips');
    expect(videoType('/x/a.MOV', null), 'video/quicktime');
    expect(videoType('/x/a.mp4', null), 'video/mp4');
  });

  test('dates, times, money and video length read like the website', () {
    expect(day('2026-09-16T08:30:00Z'), matches(RegExp(r'^\d{1,2} Sep 2026$')));
    expect(when('2026-09-16T08:30:00Z'), matches(RegExp(r'^\w{3} \d{1,2} Sep, \d{2}:\d{2}$')));
    expect(clock(125), '2:05');
    expect(clock(8), '0:08');
    expect(hours(45), '45 minutes');
    expect(hours(300), '5 hours');
    expect(hours(90), '1.5 hours');
    expect(money(1500), r'$15.00');
  });

  testWidgets('the projects grid shows each video, its state and how far it has got', (tester) async {
    final (api, _) = fakeApi((r, _) async => json([
          {'id': 'p1', 'source': 'https://youtu.be/abc', 'status': 'completed', 'message': 'Ready.', 'clip_count': 4,
            'created_at': '2026-09-15T10:00:00Z'},
          {'id': 'p2', 'source': 'upload:x', 'status': 'failed', 'message': 'Something went wrong.',
            'created_at': '2026-09-15T10:00:00Z'},
          {'id': 'p3', 'source': 'https://youtu.be/def', 'status': 'rendering', 'message': 'Creating your clips...',
            'progress': 40, 'created_at': '2026-09-16T10:00:00Z'},
        ]));
    await tester.pumpWidget(app(ProjectsPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('youtu.be'), findsOneWidget); // the site it came from; the picture tells them apart
    expect(find.text('4 clips'), findsOneWidget);
    expect(find.text('Uploaded video'), findsOneWidget);
    expect(find.text('Ada Nwosu'), findsOneWidget); // the account chip at the top
    await reach(tester, find.text('Creating your clips...')); // a working project says what it is doing
    expect(find.text('40%'), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Ready'), -150, scrollable: find.byType(Scrollable).first);
    await tester.pumpAndSettle();

    // the filter chips and the search box narrow the same list
    await tester.tap(find.text('Ready'));
    await tester.pumpAndSettle();
    expect(find.text('youtu.be'), findsOneWidget);
    expect(find.text('Uploaded video'), findsNothing);
    await tester.tap(find.text('All'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField).first, 'upload');
    await tester.pumpAndSettle();
    expect(find.text('Uploaded video'), findsOneWidget);
    expect(find.text('youtu.be'), findsNothing);
    await tester.enterText(find.byType(TextField).first, 'nothing like this');
    await tester.pumpAndSettle();
    expect(find.text('Nothing matches'), findsOneWidget);
  });

  testWidgets('with no projects at all, the grid teaches what to do', (tester) async {
    final (api, _) = fakeApi((r, _) async => json([]));
    await tester.pumpWidget(app(ProjectsPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('No projects yet'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'New project'), findsOneWidget);
  });

  testWidgets('a running project shows its video picture filling up, the step it is on and how far it is', (tester) async {
    final (api, _) = fakeApi((r, _) async => json({
          'id': 'p1', 'source': 'https://youtu.be/dQw4w9WgXcQ', 'status': 'rendering', 'message': 'Creating your clips...',
          'detail': 'clip 2 of 4', 'progress': 69, 'thumbnail': 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          'cancel_requested': false,
        }));
    await tester.pumpWidget(app(ProjectPage(api: api, id: 'p1')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(ClipLoading), findsOneWidget);
    expect(find.text('69%'), findsNWidgets(2)); // on the picture and next to the bar
    expect(find.text('Clip 2 of 4'), findsOneWidget); // the backend's lower-case detail, read as a sentence
    expect(find.text('Create the clips'), findsOneWidget); // the step it is on
    expect(tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, closeTo(0.69, 0.001));
    await tester.pumpWidget(const SizedBox()); // leave the page: polling stops
  });

  testWidgets('a failed project explains itself, with the technical detail tucked away', (tester) async {
    final (api, _) = fakeApi((r, _) async => json({
          'id': 'p1', 'source': 'https://youtu.be/x', 'status': 'failed', 'message': 'Something went wrong.', 'progress': null,
          'thumbnail': null, 'detail': 'YouTube blocked our server from downloading this video.',
          'error': 'DownloadError: ERROR: [youtube] not a bot',
        }));
    await tester.pumpWidget(app(ProjectPage(api: api, id: 'p1')));
    await tester.pumpAndSettle();
    expect(find.text('YouTube blocked our server from downloading this video.'), findsOneWidget);
    expect(find.textContaining('DownloadError'), findsNothing);
    await tester.tap(find.text('Technical details'));
    await tester.pumpAndSettle();
    expect(find.textContaining('DownloadError'), findsOneWidget);
  });

  testWidgets('a clip can be approved and its post copied; finished projects can be downloaded', (tester) async {
    final (api, seen) = fakeApi((r, body) async => switch ((r.method, r.url.path)) {
          ('PATCH', _) => json({...clip, ...jsonDecode(body)}),
          ('GET', '/api/projects/p1/publications') => json({'publications': [], 'schedule_until': null}),
          _ => json({'id': 'p1', 'source': 'upload:x', 'status': 'completed', 'message': 'Ready.', 'detail': '',
                'files_expire_at': '2126-09-16T08:00:00Z', 'clips': [clip]}),
        });
    await tester.pumpWidget(app(ProjectPage(api: api, id: 'p1')));
    await tester.pumpAndSettle();
    expect(find.text('Why most startups stall'), findsOneWidget);
    expect(find.text('1 clip'), findsOneWidget); // the summary above the clips
    expect(find.widgetWithText(FilledButton, 'Download all'), findsOneWidget);
    expect(find.text("This clip's files have expired."), findsOneWidget); // no video_url
    await reach(tester, find.text('Most startups stall here #founders')); // the TikTok post, without a tap
    expect(find.text('X'), findsNothing); // platforms with no post are hidden
    await reach(tester, find.text('Approve'));
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    final patch = seen.whereType<http.Request>().firstWhere((r) => r.method == 'PATCH');
    expect(patch.url.path, '/api/projects/p1/clips/1');
    expect(jsonDecode(patch.body), {'review': 'approved'});
    await tester.pumpWidget(const SizedBox());
  });

  test('shared text and project options', () {
    expect(sharedLink('Watch this! https://youtu.be/abc?si=x1 so good'), 'https://youtu.be/abc?si=x1');
    expect(sharedLink('no link here'), isNull);
    expect(projectSettings('', '30', '60'), {'clips': null, 'min_seconds': 30, 'max_seconds': 60, 'captions': true});
    expect(projectSettings(' 8 ', '15', '45', captions: false), {'clips': 8, 'min_seconds': 15, 'max_seconds': 45, 'captions': false});
    for (final (clips, min, max, message) in [
      ('0', '30', '60', 'Clips must be'), ('abc', '30', '60', 'Clips must be'), ('', '2', '60', 'between 5 and 180'),
      ('', '30', '200', 'between 5 and 180'), ('', '60', '30', 'must not be longer'),
    ]) {
      expect(() => projectSettings(clips, min, max), throwsA(isA<ApiError>().having((e) => e.message, 'message', contains(message))));
    }
    expect(network('twitter'), 'X');
    expect(postState({'status': 'error', 'error': 'Token expired'}), "Didn't post: Token expired");
    expect(unusable({'usable': false, 'isDisconnected': true}), 'Reconnect it in Buffer');
    expect(unusable({'usable': true}), '');
  });

  testWidgets('a clip shows why it was picked; editing sends every field', (tester) async {
    final (api, seen) = fakeApi((r, body) async => json({...clip, ...(body.isEmpty ? {} : jsonDecode(body))}));
    await tester.pumpWidget(app(Scaffold(body: Builder(
        builder: (context) => TextButton(onPressed: () => sheet(context, ClipEditor(api: api, projectId: 'p1', clip: clip)), child: const Text('open'))))));
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Title'), 'Why startups stall');
    await tester.enterText(find.widgetWithText(TextField, 'Hashtags'), '#founders  #growth');
    await tester.scrollUntilVisible(find.text('Save changes'), 300, scrollable: find.byType(Scrollable).first);
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();
    final patch = seen.single as http.Request;
    expect(patch.method, 'PATCH');
    final body = jsonDecode(patch.body);
    expect(body['title'], 'Why startups stall');
    expect(body['hashtags'], ['#founders', '#growth']);
    expect(body['hook'], 'h');
    expect(body['posts'].keys, containsAll(['tiktok', 'instagram', 'youtube', 'linkedin', 'facebook', 'x']));
    expect(body['posts']['tiktok'], 'Most startups stall here #founders');

    await tester.pumpWidget(app(Scaffold(body: SingleChildScrollView(
        child: ClipCard(clip: clip, review: (_) {}, publish: () {}, edit: () {})))));
    expect(find.text('Clip 01'), findsOneWidget);
    expect(find.text('Score 87'), findsOneWidget);
    expect(find.text('A clear, surprising answer'), findsOneWidget);
    expect(find.text('Publish'), findsNothing); // not approved and no video: can't be published
  });

  testWidgets('publish now to the chosen channels', (tester) async {
    final (api, seen) = fakeApi((r, body) async => r.method == 'GET'
        ? json([
            {'id': 'c1', 'service': 'tiktok', 'name': 'tt', 'displayName': 'The Micro-Fix', 'usable': true, 'isDisconnected': false},
            {'id': 'c2', 'service': 'instagram', 'name': 'ig', 'displayName': null, 'usable': false, 'isDisconnected': true},
          ])
        : json([{'id': 'pub1', 'status': 'sending'}], 201));
    await tester.pumpWidget(app(Scaffold(body: PublishSheet(api: api, projectId: 'p1', clip: clip))));
    await tester.pumpAndSettle();
    expect(find.text('Instagram: reconnect it in Buffer'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Post now')).onPressed, isNull); // nothing chosen yet
    await tester.tap(find.text('The Micro-Fix'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Post now'));
    await tester.pumpAndSettle();
    final post = seen.whereType<http.Request>().firstWhere((r) => r.method == 'POST');
    expect(post.url.path, '/api/projects/p1/clips/1/publish');
    expect(jsonDecode(post.body), {'channels': ['c1']}); // no due_at: now
  });

  testWidgets('a channel this clip already went to cannot be chosen twice', (tester) async {
    final (api, _) = fakeApi((r, _) async => json([
          {'id': 'c1', 'service': 'tiktok', 'name': 'tt', 'displayName': 'The Micro-Fix', 'usable': true},
        ]));
    await tester.pumpWidget(app(Scaffold(body: PublishSheet(
      api: api, projectId: 'p1', clip: clip,
      taken: const [{'id': 'pub1', 'channel_id': 'c1', 'service': 'tiktok', 'status': 'sent'}],
    ))));
    await tester.pumpAndSettle();
    expect(find.text('TikTok: already posted'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Post now')).onPressed, isNull);
  });

  testWidgets('the calendar previews, then schedules in the phone time zone', (tester) async {
    final (api, seen) = fakeApi((r, body) async => switch ((r.method, r.url.path)) {
          ('GET', '/api/publishing/channels') => json([
              {'id': 'c1', 'service': 'youtube', 'name': 'yt', 'displayName': 'Channel', 'usable': true},
            ]),
          ('GET', '/api/projects/p1') => json({
              'id': 'p1', 'source': 'upload:x', 'status': 'completed', 'message': 'Ready.',
              'clips': [{...clip, 'review': 'approved'}],
            }),
          ('GET', _) => json({'publications': [
              {'id': 'pub1', 'clip_idx': 2, 'service': 'youtube', 'channel_name': 'Channel', 'status': 'scheduled', 'due_at': '2026-09-20T08:00:00Z'},
            ], 'schedule_until': '2126-09-20T08:00:00Z'}),
          (_, '/api/projects/p1/calendar/plan') => json({
              'posts': [{'clip_idx': 1, 'title': 'Why most startups stall', 'due_at': '2026-09-16T08:00:00Z'}], 'left': [],
            }),
          _ => json({'publications': []}, 201),
        });
    await tester.pumpWidget(app(CalendarPage(api: api, projectId: 'p1', timezone: () async => 'Africa/Lagos')));
    await tester.pumpAndSettle();
    await reach(tester, find.text('Clip 2 on YouTube'));
    await tester.ensureVisible(find.text('Channel').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Channel').first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Preview the calendar'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Preview the calendar'));
    await tester.pumpAndSettle();
    final plan = seen.whereType<http.Request>().firstWhere((r) => r.url.path.endsWith('/calendar/plan'));
    final body = jsonDecode(plan.body);
    expect(body['channels'], ['c1']);
    expect(body['days'], [1, 3, 5]);
    expect(body['times'], ['09:00']);
    expect(body['timezone'], 'Africa/Lagos');
    expect(body['start'], matches(RegExp(r'^\d{4}-\d{2}-\d{2}$')));
    await tester.ensureVisible(find.text('Why most startups stall'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Schedule 1 clip'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Schedule 1 clip'));
    await tester.pumpAndSettle();
    expect(seen.whereType<http.Request>().where((r) => r.method == 'POST' && r.url.path == '/api/projects/p1/calendar'), hasLength(1));
    await tester.pumpWidget(const SizedBox()); // leave the page: polling stops
  });

  testWidgets('publishing: the Buffer connection and every channel it can post to', (tester) async {
    final (api, _) = fakeApi((r, _) async => json([
          {'id': 'c1', 'service': 'tiktok', 'name': 'tt', 'displayName': 'The Micro-Fix', 'usable': true},
          {'id': 'c2', 'service': 'instagram', 'name': 'ig', 'displayName': 'micro.fix', 'usable': false, 'isDisconnected': true},
        ]));
    await tester.pumpWidget(app(PublishingPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Connected'), findsOneWidget);
    expect(find.text('1 of 2 channels can post clips.'), findsOneWidget);
    await reach(tester, find.text('Ready'));
    expect(find.text('Reconnect it in Buffer'), findsOneWidget);
  });

  testWidgets('plan: what it costs, what is left this month, and no way to pay in the app', (tester) async {
    final (api, seen) = fakeApi((r, _) async => json({
          'plans': [
            {'id': 'creator', 'name': 'Creator', 'price_cents': 1500, 'videos': 5, 'minutes': 300, 'clips': 50},
            {'id': 'pro', 'name': 'Pro', 'price_cents': 3900, 'videos': 15, 'minutes': 900, 'clips': 150},
          ],
          'subscription': {'plan': 'creator', 'price_cents': 1500, 'started_at': '2026-09-01T08:00:00Z', 'status': 'active'},
          'usage': {'videos': 2, 'minutes': 65, 'clips': 18},
          'history': [{'id': 's1', 'plan': 'creator', 'price_cents': 1500, 'charged_cents': 0, 'status': 'active', 'started_at': '2026-09-01T08:00:00Z'}],
        }));
    await tester.pumpWidget(app(PlanPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('Creator'), findsWidgets);
    expect(find.textContaining(r'$15.00 a month, not charged during early access'), findsOneWidget);
    await reach(tester, find.text('2 of 5')); // videos
    expect(find.text('18 of 50'), findsOneWidget); // clips
    await reach(tester, find.text('Plans are chosen on the website, never in the app.'));
    expect(seen.every((r) => r.method == 'GET'), isTrue); // looking at the plan changes nothing
  });

  testWidgets('the bar moves between the four places', (tester) async {
    var current = 0;
    await tester.pumpWidget(app(Scaffold(bottomNavigationBar: StatefulBuilder(
      builder: (context, setState) => NavBar(current: current, onChanged: (next) => setState(() => current = next)),
    ))));
    for (final label in ['Projects', 'Publishing', 'Plan', 'Account']) {
      expect(find.text(label), findsOneWidget);
    }
    await tester.tap(find.text('Plan'));
    await tester.pumpAndSettle();
    expect(current, 2);
  });
}
