import 'dart:convert';
import 'dart:io';

import 'package:app/api.dart';
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

  test('labels', () {
    expect(sourceLabel('upload:abc'), 'Uploaded video');
    expect(sourceLabel('https://www.youtube.com/watch?v=abc'), 'youtube.com/watch?v=abc');
    expect(plural(1, 'clip'), '1 clip');
    expect(plural(3, 'clip'), '3 clips');
    expect(videoType('/x/a.MOV', null), 'video/quicktime');
    expect(videoType('/x/a.mp4', null), 'video/mp4');
  });

  testWidgets('projects list shows each project and its state', (tester) async {
    final (api, _) = fakeApi((r, _) async => json([
          {'id': 'p1', 'source': 'https://youtu.be/abc', 'status': 'completed', 'message': 'Ready.', 'clip_count': 4},
          {'id': 'p2', 'source': 'upload:x', 'status': 'failed', 'message': 'Something went wrong.'},
        ]));
    await tester.pumpWidget(MaterialApp(theme: theme, home: ProjectsPage(api: api)));
    await tester.pumpAndSettle();
    expect(find.text('youtu.be/abc'), findsOneWidget);
    expect(find.text('4 clips ready'), findsOneWidget);
    expect(find.text('Uploaded video'), findsOneWidget);
    expect(find.text('Something went wrong.'), findsOneWidget);
  });

  testWidgets('a running project shows its video picture filling up and how far it is', (tester) async {
    final (api, _) = fakeApi((r, _) async => json({
          'id': 'p1', 'source': 'https://youtu.be/dQw4w9WgXcQ', 'status': 'rendering', 'message': 'Creating your clips...',
          'detail': 'clip 2 of 4', 'progress': 69, 'thumbnail': 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          'cancel_requested': false,
        }));
    await tester.pumpWidget(MaterialApp(theme: theme, home: ProjectPage(api: api, id: 'p1')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.byType(ClipLoading), findsOneWidget);
    expect(find.text('69%'), findsNWidgets(2)); // on the picture and next to the bar
    expect(find.text('clip 2 of 4'), findsOneWidget);
    expect(tester.widget<LinearProgressIndicator>(find.byType(LinearProgressIndicator)).value, closeTo(0.69, 0.001));
    await tester.pumpWidget(const SizedBox()); // leave the page: polling stops
  });

  testWidgets('a failed project explains itself without technical details', (tester) async {
    final (api, _) = fakeApi((r, _) async => json({
          'id': 'p1', 'source': 'https://youtu.be/x', 'status': 'failed', 'message': 'Something went wrong.', 'progress': null,
          'thumbnail': null, 'detail': 'YouTube blocked our server from downloading this video.',
          'error': 'DownloadError: ERROR: [youtube] not a bot',
        }));
    await tester.pumpWidget(MaterialApp(theme: theme, home: ProjectPage(api: api, id: 'p1')));
    await tester.pumpAndSettle();
    expect(find.text('YouTube blocked our server from downloading this video.'), findsOneWidget);
    expect(find.textContaining('DownloadError'), findsNothing);
  });

  testWidgets('a clip can be approved and its posts copied', (tester) async {
    final (api, seen) = fakeApi((r, body) async => r.method == 'PATCH'
        ? json({...clip, ...jsonDecode(body)})
        : json({'id': 'p1', 'source': 'upload:x', 'status': 'completed', 'message': 'Ready.', 'detail': '', 'clips': [clip]}));
    await tester.pumpWidget(MaterialApp(theme: theme, home: ProjectPage(api: api, id: 'p1')));
    await tester.pumpAndSettle();
    expect(find.text('Why most startups stall'), findsOneWidget);
    expect(find.text("This clip's files have expired."), findsOneWidget); // no video_url
    await tester.tap(find.text('Approve'));
    await tester.pumpAndSettle();
    final patch = seen.whereType<http.Request>().firstWhere((r) => r.method == 'PATCH');
    expect(patch.url.path, '/api/projects/p1/clips/1');
    expect(jsonDecode(patch.body), {'review': 'approved'});
    await tester.tap(find.text('Posts'));
    await tester.pumpAndSettle();
    expect(find.text('Most startups stall here #founders'), findsOneWidget);
    expect(find.text('X'), findsNothing); // empty posts are hidden
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
  });

  testWidgets('a clip shows why it was picked; editing sends every field', (tester) async {
    final (api, seen) = fakeApi((r, body) async => json({...clip, ...(body.isEmpty ? {} : jsonDecode(body))}));
    await tester.pumpWidget(MaterialApp(theme: theme, home: Scaffold(body: Builder(
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

    await tester.pumpWidget(MaterialApp(theme: theme, home: Scaffold(body: SingleChildScrollView(
        child: ClipCard(clip: clip, review: (_) {}, publish: () {}, edit: () {})))));
    expect(find.text('Clip 1'), findsOneWidget);
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
    await tester.pumpWidget(MaterialApp(theme: theme, home: Scaffold(body: PublishSheet(api: api, projectId: 'p1', clip: clip))));
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

  testWidgets('the calendar previews, then schedules in the phone time zone', (tester) async {
    final (api, seen) = fakeApi((r, body) async => switch ((r.method, r.url.path)) {
          ('GET', '/api/publishing/channels') => json([
              {'id': 'c1', 'service': 'youtube', 'name': 'yt', 'displayName': 'Channel', 'usable': true},
            ]),
          ('GET', _) => json({'publications': [
              {'id': 'pub1', 'clip_idx': 2, 'service': 'youtube', 'channel_name': 'Channel', 'status': 'scheduled', 'due_at': '2026-09-20T08:00:00Z'},
            ], 'schedule_until': null}),
          (_, '/api/projects/p1/calendar/plan') => json({
              'posts': [{'clip_idx': 1, 'title': 'Why most startups stall', 'due_at': '2026-09-16T08:00:00Z'}], 'left': [],
            }),
          _ => json({'publications': []}, 201),
        });
    await tester.pumpWidget(MaterialApp(theme: theme, home: CalendarPage(api: api, projectId: 'p1', timezone: () async => 'Africa/Lagos')));
    await tester.pumpAndSettle();
    expect(find.text('Clip 2 on YouTube'), findsOneWidget);
    await tester.tap(find.byType(CheckboxListTile));
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
    expect(find.text('Why most startups stall'), findsOneWidget);
    await tester.ensureVisible(find.text('Schedule 1 clip'));
    await tester.tap(find.text('Schedule 1 clip'));
    await tester.pumpAndSettle();
    expect(seen.whereType<http.Request>().where((r) => r.method == 'POST' && r.url.path == '/api/projects/p1/calendar'), hasLength(1));
    await tester.pumpWidget(const SizedBox()); // leave the page: polling stops
  });
}
