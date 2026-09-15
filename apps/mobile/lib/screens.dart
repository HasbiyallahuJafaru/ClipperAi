import 'dart:async';
import 'dart:io';

import 'package:clerk_flutter/clerk_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';
import 'package:video_player/video_player.dart';

import 'api.dart';
import 'main.dart';
import 'publish.dart';

const platforms = {
  'tiktok': 'TikTok', 'instagram': 'Instagram', 'youtube': 'YouTube', 'linkedin': 'LinkedIn', 'facebook': 'Facebook', 'x': 'X',
};

void toast(BuildContext context, Object message) =>
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$message')));

/// Fetches on open and every 3 s while [busy] says the backend is still working, like the website's usePoll.
mixin Polling<T extends StatefulWidget> on State<T> {
  dynamic data;
  Object? error;
  Timer? _timer;

  Future<dynamic> fetch();
  bool busy(dynamic data) => false;

  Future<void> load() async {
    try {
      final fresh = await fetch();
      if (!mounted) return;
      setState(() {
        data = fresh;
        error = null;
      });
      _timer?.cancel();
      if (busy(fresh)) _timer = Timer(const Duration(seconds: 3), load);
    } catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Widget loaded(Widget Function(dynamic data) build) {
    if (data != null) return build(data);
    if (error != null) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text('$error', textAlign: TextAlign.center, style: const TextStyle(color: muted)),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: load, child: const Text('Try again')),
      ]));
    }
    return const Center(child: CircularProgressIndicator());
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, this.background = line, this.color = ink, this.dot = false});
  final String label;
  final Color background, color;
  final bool dot;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: ShapeDecoration(color: background, shape: const StadiumBorder(side: BorderSide(color: line))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dot) ...[const CircleAvatar(radius: 4, backgroundColor: accent), const SizedBox(width: 6)],
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: color))),
        ]),
      );
}

Widget projectState(Map project) => switch (project['status']) {
      'completed' => StatusChip('${plural(project['clip_count'] ?? project['clips']?.length ?? 0, 'clip')} ready', background: accentSoft, color: accentInk),
      'failed' => StatusChip(project['message'], background: dangerSoft, color: danger),
      'cancelled' => StatusChip(project['message']),
      _ => StatusChip(project['message'], background: surface, dot: true),
    };

Widget progressBar(int? percent) => Row(children: [
      Expanded(child: LinearProgressIndicator(value: (percent ?? 0) / 100, minHeight: 6, borderRadius: BorderRadius.circular(3))),
      const SizedBox(width: 10),
      Text('${percent ?? 0}%', style: const TextStyle(fontSize: 12.5, color: muted, fontFeatures: [FontFeature.tabularFigures()])),
    ]);

/// The source video's picture in a 9:16 clip frame that fills with colour from the bottom as clips are made (like the
/// website's ClipLoading).
class ClipLoading extends StatelessWidget {
  const ClipLoading({super.key, required this.src, required this.progress});
  final String src;
  final int progress;

  static const grey = ColorFilter.matrix([
    0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0, 1, 0,
  ]);

  @override
  Widget build(BuildContext context) {
    Widget picture() => Image.network(src, fit: BoxFit.cover, errorBuilder: (context, error, stack) => const SizedBox());
    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: SizedBox(width: 160, height: 284, child: ColoredBox(color: ink, child: Stack(fit: StackFit.expand, children: [
        Opacity(opacity: 0.45, child: ColorFiltered(colorFilter: grey, child: picture())),
        TweenAnimationBuilder<double>(
          tween: Tween(end: progress / 100), duration: const Duration(milliseconds: 700), curve: Curves.easeOut,
          builder: (context, value, child) => ClipRect(clipper: _FromBottom(value), child: child),
          child: picture(),
        ),
        Positioned(left: 0, right: 0, bottom: 12, child: Text('$progress%', textAlign: TextAlign.center, style: const TextStyle(
          color: Colors.white, fontWeight: FontWeight.w600, fontSize: 14, shadows: [Shadow(blurRadius: 6, color: Color(0x99000000))],
        ))),
      ]))),
    );
  }
}

class _FromBottom extends CustomClipper<Rect> {
  _FromBottom(this.share);
  final double share;

  @override
  Rect getClip(Size size) => Rect.fromLTRB(0, size.height * (1 - share), size.width, size.height);

  @override
  bool shouldReclip(_FromBottom oldClipper) => oldClipper.share != share;
}

class ProjectsPage extends StatefulWidget {
  const ProjectsPage({super.key, required this.api, this.shared, this.timezone});
  final Api api;
  final Stream<Shared>? shared; // links and videos shared to the app from other apps
  final Future<String> Function()? timezone;

  @override
  State<ProjectsPage> createState() => _ProjectsPageState();
}

class _ProjectsPageState extends State<ProjectsPage> with Polling {
  @override
  Future fetch() => widget.api.call('GET', '/projects');

  @override
  bool busy(data) => (data as List).any((p) => running.contains(p['status']));

  StreamSubscription<Shared>? sharing;

  @override
  void initState() {
    super.initState();
    sharing = widget.shared?.listen((item) => newProject(link: item.link, video: item.video));
  }

  @override
  void dispose() {
    sharing?.cancel();
    super.dispose();
  }

  Future<void> open(Widget page) async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    load();
  }

  Future<void> newProject({String? link, File? video}) async {
    final id = await sheet<String>(context, NewProject(api: widget.api, link: link, video: video));
    if (id != null) open(ProjectPage(api: widget.api, id: id, timezone: widget.timezone));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Logo(), actions: [
          IconButton(tooltip: 'Plan and usage', icon: const Icon(Icons.bar_chart_rounded), onPressed: () => open(PlanPage(api: widget.api))),
          IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout_rounded), onPressed: () => ClerkAuth.of(context, listen: false).signOut()),
        ]),
        floatingActionButton: FloatingActionButton.extended(
          backgroundColor: accent, foregroundColor: Colors.white, shape: const StadiumBorder(),
          icon: const Icon(Icons.add_rounded), label: const Text('New project'),
          onPressed: newProject,
        ),
        body: loaded((projects) => RefreshIndicator(
              onRefresh: load,
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 96), children: [
                const Heading(before: 'Your ', accent: 'projects'),
                const SizedBox(height: 16),
                if (projects.isEmpty)
                  const Card(child: Padding(padding: EdgeInsets.all(24), child: Text(
                    'Nothing here yet. Paste a link or pick a video from your phone to make your first clips.',
                    style: TextStyle(color: muted),
                  ))),
                for (final project in projects)
                  Padding(padding: const EdgeInsets.only(bottom: 10), child: Card(child: ListTile(
                    contentPadding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                    leading: project['thumbnail'] == null ? null : ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: Image.network(project['thumbnail'], width: 72, height: 44, fit: BoxFit.cover,
                          errorBuilder: (context, error, stack) => const SizedBox(width: 72, height: 44, child: ColoredBox(color: ground))),
                    ),
                    title: Text(sourceLabel(project['source']), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w500)),
                    subtitle: Padding(padding: const EdgeInsets.only(top: 8), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      projectState(project),
                      if (running.contains(project['status'])) ...[
                        const SizedBox(height: 8),
                        progressBar(project['progress']),
                      ],
                    ])),
                    trailing: const Icon(Icons.chevron_right_rounded, color: muted),
                    onTap: () => open(ProjectPage(api: widget.api, id: project['id'], timezone: widget.timezone)),
                  ))),
              ]),
            )),
      );
}

/// Bottom sheet: a link or a video from the phone. Pops with the new project's id.
class NewProject extends StatefulWidget {
  const NewProject({super.key, required this.api, this.link, this.video});
  final Api api;
  final String? link; // shared from another app
  final File? video; // shared from another app: uploaded straight away

  @override
  State<NewProject> createState() => _NewProjectState();
}

class _NewProjectState extends State<NewProject> {
  late final link = TextEditingController(text: widget.link);
  final clips = TextEditingController();
  final shortest = TextEditingController(text: '30');
  final longest = TextEditingController(text: '60');
  bool options = false;
  bool captions = true; // off for videos that already have subtitles burned in
  double? uploaded; // 0..1 while a video is on its way

  @override
  void initState() {
    super.initState();
    final video = widget.video;
    if (video != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => upload(video, videoType(video.path, null)));
    }
  }

  void upload(File video, String type) =>
      create(() => widget.api.upload(video, type, (done) => setState(() => uploaded = done)));
  bool sending = false;
  String? problem;

  Future<void> create(Future<String> Function() source) async {
    setState(() {
      sending = true;
      problem = null;
    });
    try {
      final settings = projectSettings(clips.text, shortest.text, longest.text, captions: captions); // checked before a file is sent
      final project = await widget.api.call('POST', '/projects', {'source': await source(), ...settings});
      if (mounted) Navigator.of(context).pop(project['id'] as String);
    } catch (e) {
      if (mounted) {
        setState(() {
          sending = false;
          uploaded = null;
          problem = '$e';
        });
      }
    }
  }

  Future<void> pick() async {
    final video = await ImagePicker().pickVideo(source: ImageSource.gallery);
    if (video == null) return;
    upload(File(video.path), videoType(video.path, video.mimeType));
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 24, 16, 24 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Heading(before: 'New ', accent: 'project', size: 24),
          const SizedBox(height: 16),
          TextField(
            controller: link, enabled: !sending, keyboardType: TextInputType.url, autocorrect: false,
            decoration: const InputDecoration(hintText: 'Paste a YouTube or video link'),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: sending ? null : () => create(() async => link.text.trim()),
            child: const Text('Make clips'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: sending ? null : pick,
            icon: const Icon(Icons.video_library_outlined), label: const Text('Pick a video from your phone'),
          ),
          Align(alignment: Alignment.centerLeft, child: TextButton.icon(
            onPressed: () => setState(() => options = !options),
            icon: const Icon(Icons.tune_rounded, size: 18), label: Text(options ? 'Hide options' : 'Options'),
          )),
          if (options)
            Row(children: [
              Expanded(child: TextField(controller: clips, enabled: !sending, keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Clips', hintText: 'Automatic'))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: shortest, enabled: !sending, keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Shortest (s)'))),
              const SizedBox(width: 8),
              Expanded(child: TextField(controller: longest, enabled: !sending, keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Longest (s)'))),
            ]),
          if (options)
            SwitchListTile(
              contentPadding: EdgeInsets.zero, value: captions, onChanged: sending ? null : (on) => setState(() => captions = on),
              title: const Text('Add captions', style: TextStyle(fontWeight: FontWeight.w500)),
              subtitle: const Text('Turn off for videos that already have subtitles burned in.'),
            ),
          if (uploaded != null) ...[
            const SizedBox(height: 16),
            LinearProgressIndicator(value: uploaded, minHeight: 6, borderRadius: BorderRadius.circular(3)),
            const SizedBox(height: 6),
            Text('Uploading ${(uploaded! * 100).round()}%', style: const TextStyle(color: muted)),
          ],
          if (problem != null) ...[
            const SizedBox(height: 16),
            Text(problem!, style: const TextStyle(color: danger)),
          ],
        ]),
      );
}

class ProjectPage extends StatefulWidget {
  const ProjectPage({super.key, required this.api, required this.id, this.timezone});
  final Api api;
  final String id;
  final Future<String> Function()? timezone;

  @override
  State<ProjectPage> createState() => _ProjectPageState();
}

class _ProjectPageState extends State<ProjectPage> with Polling {
  @override
  Future fetch() => widget.api.call('GET', '/projects/${widget.id}');

  @override
  bool busy(data) => running.contains(data['status']);

  Future<void> act(Future Function() action) async {
    try {
      await action();
    } catch (e) {
      if (mounted) toast(context, e);
    }
    load();
  }

  Future<void> delete() async {
    final sure = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: const Text('Delete this project?'),
      content: const Text("All of its clips will be deleted. This can't be undone."),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Keep it')),
        TextButton(onPressed: () => Navigator.pop(context, true), style: TextButton.styleFrom(foregroundColor: danger), child: const Text('Delete')),
      ],
    ));
    if (sure != true) return;
    try {
      await widget.api.call('DELETE', '/projects/${widget.id}');
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) toast(context, e);
    }
  }

  Future<void> openSheet(Widget child) async {
    if (await sheet<bool>(context, child) == true) load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Project'), actions: [
          if (data?['status'] == 'completed')
            IconButton(tooltip: 'Calendar', icon: const Icon(Icons.calendar_month_rounded), onPressed: () async {
              await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CalendarPage(api: widget.api, projectId: widget.id, timezone: widget.timezone)));
              load();
            }),
          if (data != null && !running.contains(data['status']))
            IconButton(tooltip: 'Delete project', icon: const Icon(Icons.delete_outline_rounded), onPressed: delete),
        ]),
        body: loaded((project) => RefreshIndicator(
              onRefresh: load,
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
                Text(sourceLabel(project['source']), style: const TextStyle(color: muted)),
                const SizedBox(height: 8),
                Align(alignment: Alignment.centerLeft, child: projectState(project)),
                if (busy(project)) ...[
                  if (project['thumbnail'] != null) ...[
                    const SizedBox(height: 20),
                    Center(child: ClipLoading(src: project['thumbnail'], progress: project['progress'] ?? 0)),
                  ],
                  const SizedBox(height: 20),
                  progressBar(project['progress']),
                  if ('${project['detail']}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(project['detail'], style: const TextStyle(color: muted))),
                  const SizedBox(height: 12),
                  Align(alignment: Alignment.centerLeft, child: OutlinedButton(
                    onPressed: project['cancel_requested'] == true ? null : () => act(() => widget.api.call('POST', '/projects/${widget.id}/cancel')),
                    child: Text(project['cancel_requested'] == true ? 'Cancelling...' : 'Cancel'),
                  )),
                ],
                if (project['status'] == 'failed')
                  Padding(padding: const EdgeInsets.only(top: 12), child: Text(
                    '${project['detail'] ?? ''}'.isNotEmpty
                        ? '${project['detail']}'
                        : "We couldn't make clips from this video. Check that the link plays in a browser, or upload the file instead.",
                    style: const TextStyle(color: danger),
                  )),
                for (final clip in project['clips'] ?? [])
                  Padding(padding: const EdgeInsets.only(top: 16), child: ClipCard(
                    key: ValueKey(clip['idx']), clip: clip,
                    review: (review) => act(() => widget.api.call('PATCH', '/projects/${widget.id}/clips/${clip['idx']}', {'review': review})),
                    edit: () => openSheet(ClipEditor(api: widget.api, projectId: widget.id, clip: clip)),
                    publish: () => openSheet(PublishSheet(api: widget.api, projectId: widget.id, clip: clip)),
                  )),
              ]),
            )),
      );
}

class ClipCard extends StatefulWidget {
  const ClipCard({super.key, required this.clip, required this.review, this.edit, this.publish});
  final Map clip;
  final void Function(String review) review;
  final VoidCallback? edit, publish;

  @override
  State<ClipCard> createState() => _ClipCardState();
}

class _ClipCardState extends State<ClipCard> {
  VideoPlayerController? player;
  bool sharing = false;

  @override
  void dispose() {
    player?.dispose();
    super.dispose();
  }

  Future<void> play() async {
    if (player != null) return setState(() => player!.value.isPlaying ? player!.pause() : player!.play());
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.clip['video_url']));
    setState(() => player = controller);
    await controller.initialize();
    await controller.setLooping(true);
    if (mounted) setState(() => controller.play());
  }

  /// Downloads the clip and opens the phone's share sheet (save to gallery, send, post from another app).
  Future<void> share() async {
    setState(() => sharing = true);
    try {
      final file = File('${Directory.systemTemp.path}/clip-${widget.clip['idx']}.mp4');
      final response = await HttpClient().getUrl(Uri.parse(widget.clip['video_url'])).then((r) => r.close());
      if (response.statusCode != 200) throw "Couldn't download the clip. Try again.";
      await response.pipe(file.openWrite());
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: 'video/mp4')], title: widget.clip['title']));
    } catch (e) {
      if (mounted) toast(context, e);
    }
    if (mounted) setState(() => sharing = false);
  }

  @override
  Widget build(BuildContext context) {
    final clip = widget.clip;
    final live = clip['video_url'] != null;
    final review = clip['review'];
    return Card(clipBehavior: Clip.antiAlias, child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (live)
        GestureDetector(onTap: play, child: AspectRatio(aspectRatio: 9 / 16, child: ColoredBox(color: ink, child: Stack(fit: StackFit.expand, children: [
          if (player?.value.isInitialized == true)
            FittedBox(fit: BoxFit.cover, child: SizedBox(width: player!.value.size.width, height: player!.value.size.height, child: VideoPlayer(player!)))
          else if (clip['thumbnail_url'] != null)
            Image.network(clip['thumbnail_url'], fit: BoxFit.cover),
          if (player?.value.isPlaying != true)
            const Center(child: CircleAvatar(radius: 28, backgroundColor: Color(0xCCFFFFFF), child: Icon(Icons.play_arrow_rounded, color: ink, size: 34))),
        ])))),
      Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Text('Clip ${clip['idx']}', style: const TextStyle(color: muted, fontSize: 13)),
          if (clip['score'] != null) ...[const SizedBox(width: 8), StatusChip('Score ${clip['score']}')],
        ]),
        const SizedBox(height: 4),
        Text(clip['title'], style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: -0.4)),
        if ('${clip['reason'] ?? ''}'.isNotEmpty)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text(clip['reason'], style: const TextStyle(color: muted, fontSize: 13.5))),
        if (!live) const Padding(padding: EdgeInsets.only(top: 6), child: Text("This clip's files have expired.", style: TextStyle(color: muted))),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 8, children: [
          review == 'approved'
              ? FilledButton.icon(onPressed: () => widget.review('pending'), icon: const Icon(Icons.check_rounded), label: const Text('Approved'))
              : OutlinedButton(onPressed: () => widget.review('approved'), child: const Text('Approve')),
          review == 'rejected'
              ? FilledButton(style: FilledButton.styleFrom(backgroundColor: ink), onPressed: () => widget.review('pending'), child: const Text('Rejected'))
              : OutlinedButton(onPressed: () => widget.review('rejected'), child: const Text('Reject')),
          if (live)
            OutlinedButton.icon(
              onPressed: sharing ? null : share,
              icon: sharing ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.ios_share_rounded, size: 18),
              label: const Text('Save or share'),
            ),
          if (widget.edit != null) OutlinedButton.icon(onPressed: widget.edit, icon: const Icon(Icons.edit_outlined, size: 18), label: const Text('Edit')),
          if (widget.publish != null && live && review == 'approved')
            FilledButton.icon(onPressed: widget.publish, icon: const Icon(Icons.send_rounded, size: 18), label: const Text('Publish')),
        ]),
      ])),
      Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          title: const Text('Posts', style: TextStyle(fontWeight: FontWeight.w500)),
          childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          children: [
            for (final MapEntry(:key, :value) in platforms.entries)
              if ('${clip['posts']?[key] ?? ''}'.isNotEmpty)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
                  subtitle: Text(clip['posts'][key], style: const TextStyle(color: muted)),
                  trailing: IconButton(tooltip: 'Copy', icon: const Icon(Icons.copy_rounded, size: 20), onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: clip['posts'][key]));
                    if (context.mounted) toast(context, '$value post copied');
                  }),
                ),
          ],
        ),
      ),
    ]));
  }
}

/// Plan and this month's usage, read only: plans are chosen on the website (no purchases in the app).
class PlanPage extends StatefulWidget {
  const PlanPage({super.key, required this.api});
  final Api api;

  @override
  State<PlanPage> createState() => _PlanPageState();
}

class _PlanPageState extends State<PlanPage> with Polling {
  @override
  Future fetch() => widget.api.call('GET', '/billing');

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Plan and usage')),
        body: loaded((billing) {
          final subscription = billing['subscription'];
          final plan = subscription == null ? null : (billing['plans'] as List).firstWhere((p) => p['id'] == subscription['plan']);
          return ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
            Card(child: Padding(padding: const EdgeInsets.all(20), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(plan == null ? 'No plan yet' : '${plan['name']} plan', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w600, letterSpacing: -0.6)),
              const SizedBox(height: 6),
              const Text('Plans are managed on the website.', style: TextStyle(color: muted)),
              for (final (key, label) in [('videos', 'Videos'), ('minutes', 'Minutes of video'), ('clips', 'Clips')]) ...[
                const SizedBox(height: 18),
                Row(children: [
                  Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w500))),
                  Text('${billing['usage'][key]}${plan?[key] == null ? '' : ' of ${plan![key]}'}', style: const TextStyle(color: muted)),
                ]),
                if (plan?[key] != null) ...[
                  const SizedBox(height: 8),
                  LinearProgressIndicator(value: (billing['usage'][key] / plan![key]).clamp(0, 1).toDouble(), minHeight: 6, borderRadius: BorderRadius.circular(3)),
                ],
              ],
            ]))),
          ]);
        }),
      );
}
