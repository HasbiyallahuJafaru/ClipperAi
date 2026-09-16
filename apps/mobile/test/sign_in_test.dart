import 'dart:io';

// ignore: depend_on_referenced_packages
import 'package:clerk_auth/clerk_auth.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

/// Answers with Clerk's real replies (recorded from the dev instance, test/clerk/*.json) and records the calls.
class RecordedClerk extends DefaultHttpService {
  final calls = <String>[];

  @override
  Future<http.Response> send(HttpMethod method, Uri uri,
      {Map<String, String>? headers, Map<String, dynamic>? params, String? body}) async {
    final name = uri.path.split('/').last;
    calls.add(name);
    final file = name.startsWith('attempt_') ? 'prepare_second_factor' : name;
    return http.Response(File('test/clerk/$file.json').readAsStringSync(), 200);
  }
}

void main() {
  test('a capitalised email keeps its sign-in at the code step (one code emailed, not a new one)', () async {
    final clerk = RecordedClerk();
    final auth = Auth(config: AuthConfig(
      publishableKey: 'pk_test_Y2xlcmsuZXhhbXBsZS5jb20k', // fake host: every reply comes from RecordedClerk
      persistor: Persistor.none,
      sessionTokenPolling: false,
      httpService: clerk,
    ));
    await auth.initialize();
    const typed = 'Mobile+Clerk_Test@example.com'; // Clerk answers it lowercased
    // what ClerkSignInPanel does: password -> Clerk asks to verify the device -> prepare the code -> submit it
    await auth.attemptSignIn(strategy: Strategy.password, identifier: typed, password: 'pw');
    await auth.attemptSignIn(strategy: Strategy.emailCode);
    await auth.attemptSignIn(strategy: Strategy.emailCode, identifier: typed, password: 'pw', code: '123456');
    auth.terminate();
    expect(clerk.calls.where((c) => c == 'sign_ins').length, 1, reason: 'a second sign-in emails a new code');
    expect(clerk.calls.where((c) => c.startsWith('prepare_')).length, 1);
    expect(clerk.calls.last, 'attempt_second_factor');
  });
}
