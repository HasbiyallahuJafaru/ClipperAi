import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:phosphor_icons/phosphor_icons.dart';
import 'package:share_plus/share_plus.dart';
import 'package:video_player/video_player.dart';

import 'api.dart';
import 'home.dart';
import 'main.dart';
import 'publish.dart';
import 'ui.dart';

const platforms = {
  'tiktok': 'TikTok', 'instagram': 'Instagram', 'youtube': 'YouTube', 'linkedin': 'LinkedIn', 'facebook': 'Facebook', 'x': 'X',
};

/// What the backend is doing, in the order it happens (the website's STEPS).
const steps = [
  ('downloading', 'Get the video'),
  ('transcribing', 'Listen to it'),
  ('analyzing', 'Find the strongest moments'),
  ('rendering', 'Create the clips'),
  ('packaging', 'Prepare the files'),
];

Widget projectState(Map project) => switch (project['status']) {
      'completed' => StatusChip('${plural(project['clip_count'] ?? project['clips']?.length ?? 0, 'clip')} ready',
          background: accentSoft, color: accentInk, icon: PhosphorIconsFill.checkCircle),
      'failed' => StatusChip(project['message'], background: dangerSoft, color: danger, icon: PhosphorIconsFill.warningCircle),
      'cancelled' => StatusChip(project['message'], icon: PhosphorIconsBold.prohibit),
      _ => StatusChip(project['message'], background: surface, dot: true),
    };

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
      borderRadius: cardRadius,
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
  final search = TextEditingController();
  String filter = 'all';

  @override
  void initState() {
    super.initState();
    sharing = widget.shared?.listen((item) => newProject(link: item.link, video: item.video));
  }

  @override
  void dispose() {
    sharing?.cancel();
    search.dispose();
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

  /// The projects a filter chip and the search box leave.
  List shown(List projects) {
    final words = search.text.trim().toLowerCase();
    return projects.where((p) {
      final state = switch (p['status']) {
        'completed' => 'ready',
        'failed' || 'cancelled' => 'failed',
        _ => 'working',
      };
      if (filter != 'all' && filter != state) return false;
      return words.isEmpty || sourceLabel(p['source'], p['source_title']).toLowerCase().contains(words);
    }).toList();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: load,
          child: CustomScrollView(slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              sliver: SliverToBoxAdapter(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                PageTop(actions: [
                  RoundButton(
                    icon: PhosphorIconsBold.plus, tooltip: 'New project', background: accent, color: Colors.white,
                    onPressed: newProject,
                  ),
                ]),
                const SizedBox(height: 20),
                const Heading(before: 'Your videos,\n', accent: 'ready to post', size: 30),
                const SizedBox(height: 18),
                TextField(
                  controller: search,
                  onChanged: (_) => setState(() {}),
                  textInputAction: TextInputAction.search,
                  decoration: InputDecoration(
                    hintText: 'Search your videos',
                    prefixIcon: Icon(PhosphorIconsRegular.magnifyingGlass, size: 20, color: muted),
                    suffixIcon: search.text.isEmpty ? null : IconButton(
                      tooltip: 'Clear',
                      icon: Icon(PhosphorIconsBold.x, size: 16, color: muted),
                      onPressed: () => setState(search.clear),
                    ),
                    border: const OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(28)), borderSide: BorderSide(color: lineStrong)),
                    enabledBorder: const OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(28)), borderSide: BorderSide(color: lineStrong)),
                    focusedBorder: const OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(28)), borderSide: BorderSide(color: accent, width: 1.5)),
                    contentPadding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(height: 38, child: ListView(scrollDirection: Axis.horizontal, children: [
                  for (final (value, label) in [('all', 'All'), ('working', 'Working'), ('ready', 'Ready'), ('failed', 'Stopped')])
                    Padding(padding: const EdgeInsets.only(right: 8), child: _FilterChip(
                      label: label,
                      selected: filter == value,
                      onTap: () => setState(() => filter = value),
                    )),
                ])),
                const SizedBox(height: 18),
              ])),
            ),
            loadedSliver(),
          ]),
        ),
      );

  Widget loadedSliver() {
    if (data == null) {
      return SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, shellBottom),
        sliver: error != null
            ? SliverToBoxAdapter(child: Panel(child: Message(
                icon: PhosphorIconsFill.warningCircle, title: "That didn't load", body: '$error', tone: danger,
                action: OutlinedButton(onPressed: load, child: const Text('Try again')),
              )))
            : SliverGrid.count(
                crossAxisCount: 2, mainAxisSpacing: 14, crossAxisSpacing: 14, childAspectRatio: 0.76,
                children: [for (var i = 0; i < 4; i++) const Skeleton(height: double.infinity, radius: 20)],
              ),
      );
    }
    final projects = shown(data as List);
    if (projects.isEmpty) {
      final searching = (data as List).isNotEmpty;
      return SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, shellBottom),
        sliver: SliverToBoxAdapter(child: Panel(padding: const EdgeInsets.all(24), child: Message(
          icon: PhosphorIconsFill.filmSlate,
          title: searching ? 'Nothing matches' : 'No projects yet',
          body: searching
              ? 'Try another word, or clear the filter.'
              : 'Paste a link or pick a video from your phone, and clips come back captioned and ready to post.',
          action: searching
              ? OutlinedButton(onPressed: () => setState(() {
                  search.clear();
                  filter = 'all';
                }), child: const Text('Show all'))
              : FilledButton.icon(
                  onPressed: newProject,
                  icon: Icon(PhosphorIconsBold.plus, size: 18, color: Colors.white),
                  label: const Text('New project'),
                ),
        ))),
      );
    }
    return SliverPadding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, shellBottom),
      sliver: SliverGrid.count(
        crossAxisCount: 2, mainAxisSpacing: 14, crossAxisSpacing: 14, childAspectRatio: 0.76,
        children: [
          for (final project in projects)
            ProjectTile(
              project: project,
              onTap: () => open(ProjectPage(api: widget.api, id: project['id'], timezone: widget.timezone)),
            ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({required this.label, required this.selected, required this.onTap});
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: selected ? ink : surface,
        shape: StadiumBorder(side: BorderSide(color: selected ? ink : lineStrong)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
            child: Text(label, style: TextStyle(
              fontSize: 13.5, fontWeight: FontWeight.w500, color: selected ? Colors.white : ink)),
          ),
        ),
      );
}

/// One project in the grid: its video's picture, what state it is in, and how far it has got.
class ProjectTile extends StatelessWidget {
  const ProjectTile({super.key, required this.project, required this.onTap});
  final Map project;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final status = project['status'];
    final live = running.contains(status);
    final thumbnail = project['thumbnail'];
    final upload = '${project['source']}'.startsWith('upload:');
    return Material(
      color: ink,
      borderRadius: const BorderRadius.all(Radius.circular(20)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Stack(fit: StackFit.expand, children: [
          if (thumbnail != null)
            Image.network(thumbnail, fit: BoxFit.cover, errorBuilder: (context, error, stack) => const _NoPicture(upload: false))
          else
            _NoPicture(upload: upload),
          const DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(
            begin: Alignment.topCenter, end: Alignment.bottomCenter,
            colors: [Color(0x40000000), Color(0x00000000), Color(0xB3060B1A)], stops: [0, 0.4, 1],
          ))),
          Padding(padding: const EdgeInsets.all(10), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              _TileBadge(status: status),
              const Spacer(),
              if (status == 'completed')
                _TilePill(plural(project['clip_count'] ?? project['clips']?.length ?? 0, 'clip'))
              else if (live)
                _TilePill('${project['progress'] ?? 0}%'),
            ]),
            const Spacer(),
            Text(
              sourceName(project['source'], project['source_title']),
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w600, height: 1.2, letterSpacing: -0.2),
            ),
            const SizedBox(height: 3),
            Text(
              status == 'completed' && project['created_at'] != null
                  ? day(project['created_at'])
                  : '${project['message'] ?? ''}',
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xCCFFFFFF), fontSize: 12),
            ),
            if (live) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: (project['progress'] ?? 0) / 100, minHeight: 4,
                  backgroundColor: const Color(0x4DFFFFFF), color: Colors.white,
                ),
              ),
            ],
          ])),
        ]),
      ),
    );
  }
}

class _NoPicture extends StatelessWidget {
  const _NoPicture({required this.upload});
  final bool upload;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: const BoxDecoration(gradient: LinearGradient(
          begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF4C6AC8), Color(0xFF1B2A5E)])),
        child: Center(child: Icon(
          upload ? PhosphorIconsFill.uploadSimple : PhosphorIconsFill.link, size: 34, color: const Color(0x8CFFFFFF))),
      );
}

class _TileBadge extends StatelessWidget {
  const _TileBadge({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (icon, color) = switch (status) {
      'completed' => (PhosphorIconsFill.checkCircle, accent),
      'failed' => (PhosphorIconsFill.warningCircle, danger),
      'cancelled' => (PhosphorIconsBold.prohibit, muted),
      _ => (PhosphorIconsFill.filmStrip, accent),
    };
    return Container(
      width: 28, height: 28, alignment: Alignment.center,
      decoration: const BoxDecoration(color: Color(0xF2FFFFFF), shape: BoxShape.circle),
      child: Icon(icon, size: 15, color: color),
    );
  }
}

class _TilePill extends StatelessWidget {
  const _TilePill(this.label);
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        decoration: const ShapeDecoration(color: Color(0xF2FFFFFF), shape: StadiumBorder()),
        child: Text(label, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, color: ink)),
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
  String orientation = '9:16'; // 16:9 keeps the full frame, 1:1 makes squares
  double? uploaded; // 0..1 while a video is on its way

  @override
  void initState() {
    super.initState();
    final video = widget.video;
    if (video != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => upload(video, videoType(video.path, null)));
    }
  }

  @override
  void dispose() {
    link.dispose();
    clips.dispose();
    shortest.dispose();
    longest.dispose();
    super.dispose();
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
      final settings = projectSettings(clips.text, shortest.text, longest.text,
          captions: captions, orientation: orientation); // checked before a file is sent
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
        padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + MediaQuery.viewInsetsOf(context).bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Center(child: _Grabber()),
          const SizedBox(height: 18),
          const Heading(before: 'New ', accent: 'project', size: 24),
          const SizedBox(height: 6),
          const Text('Paste a link, or pick a video from your phone.', style: TextStyle(color: muted)),
          const SizedBox(height: 16),
          TextField(
            controller: link, enabled: !sending, keyboardType: TextInputType.url, autocorrect: false,
            decoration: InputDecoration(
              hintText: 'youtube.com/watch?v=...',
              prefixIcon: Icon(PhosphorIconsRegular.link, size: 19, color: muted),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton(
            onPressed: sending ? null : () => create(() async => link.text.trim()),
            child: const Text('Make clips'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: sending ? null : pick,
            icon: Icon(PhosphorIconsRegular.uploadSimple, size: 19, color: ink),
            label: const Text('Pick a video from your phone'),
          ),
          Align(alignment: Alignment.centerLeft, child: TextButton.icon(
            onPressed: sending ? null : () => setState(() => options = !options),
            icon: Icon(options ? PhosphorIconsBold.caretUp : PhosphorIconsBold.caretDown, size: 15, color: accentInk),
            label: Text(options ? 'Hide options' : 'Options'),
          )),
          if (options) ...[
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
            const SizedBox(height: 4),
            const Text('Left empty, about one clip per 2 minutes of video.', style: TextStyle(color: muted, fontSize: 12.5)),
            DropdownButtonFormField<String>(
              initialValue: orientation,
              decoration: const InputDecoration(labelText: 'Orientation'),
              items: const [
                DropdownMenuItem(value: '9:16', child: Text('Vertical 9:16 (TikTok, Shorts, Reels)')),
                DropdownMenuItem(value: '16:9', child: Text('Landscape 16:9 (YouTube, LinkedIn)')),
                DropdownMenuItem(value: '1:1', child: Text('Square 1:1 (feed posts)')),
              ],
              onChanged: sending ? null : (value) => setState(() => orientation = value!),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero, value: captions, onChanged: sending ? null : (on) => setState(() => captions = on),
              title: const Text('Add captions', style: TextStyle(fontWeight: FontWeight.w500)),
              subtitle: const Text('Turn off for videos that already have subtitles burned in.'),
            ),
          ],
          if (uploaded != null) ...[
            const SizedBox(height: 16),
            ProgressBar(((uploaded ?? 0) * 100).round(), label: false),
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

class _Grabber extends StatelessWidget {
  const _Grabber();

  @override
  Widget build(BuildContext context) => Container(
        width: 40, height: 4,
        decoration: BoxDecoration(color: lineStrong, borderRadius: BorderRadius.circular(2)),
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
  bool working = false; // an action of ours is on its way (approve all, cancel, delete)

  @override
  Future fetch() async {
    final project = await widget.api.call('GET', '/projects/${widget.id}');
    if (project['status'] == 'completed') {
      final posts = await widget.api.call('GET', '/projects/${widget.id}/publications');
      project['publications'] = posts['publications'];
      project['schedule_until'] = posts['schedule_until'];
    }
    return project;
  }

  @override
  bool busy(data) =>
      running.contains(data['status']) ||
      (data['publications'] as List? ?? []).any((p) => ['queued', 'sending'].contains(p['status']));

  List postsFor(int idx) =>
      (data?['publications'] as List? ?? []).where((p) => p['clip_idx'] == idx).toList();

  Future<void> act(Future<void> Function() action) async {
    setState(() => working = true);
    try {
      await action();
    } catch (e) {
      if (mounted) toast(context, e);
    }
    if (mounted) setState(() => working = false);
    await load();
  }

  Future<void> approveAll(List clips) => act(() async {
        for (final clip in clips.where((c) => c['review'] == 'pending')) {
          await widget.api.call('PATCH', '/projects/${widget.id}/clips/${clip['idx']}', {'review': 'approved'});
        }
      });

  /// Saves the project's zip (clips, captions, thumbnails and the text) and opens the phone's share sheet.
  Future<void> download() => act(() async {
        final file = File('${Directory.systemTemp.path}/yt-clipper-${widget.id}.zip');
        await widget.api.download('/projects/${widget.id}/package', file, signedIn: true);
        await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: 'application/zip')], title: 'Clips'));
      });

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

  Future<void> openCalendar() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CalendarPage(api: widget.api, projectId: widget.id, timezone: widget.timezone)));
    load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          leading: IconButton(
            tooltip: 'Back',
            icon: Icon(PhosphorIconsBold.caretLeft, size: 20, color: ink),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Text(data == null ? 'Project' : sourceLabel(data['source'], data['source_title']), overflow: TextOverflow.ellipsis),
          actions: [
            if (data?['status'] == 'completed')
              IconButton(tooltip: 'Calendar', icon: Icon(PhosphorIconsRegular.calendarBlank, size: 21, color: ink), onPressed: openCalendar),
            if (data != null && !running.contains(data['status']))
              IconButton(tooltip: 'Delete project', icon: Icon(PhosphorIconsRegular.trash, size: 21, color: ink), onPressed: delete),
            const SizedBox(width: 4),
          ],
        ),
        body: loaded(
          waiting: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 32), children: const [
            Skeleton(height: 220, radius: 24),
            SizedBox(height: 16),
            Skeleton(height: 120, radius: 24),
          ]),
          (project) {
            final clips = project['clips'] as List? ?? [];
            return RefreshIndicator(
              onRefresh: load,
              child: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 40), children: [
                Row(children: [
                  if (!busy(project)) ...[
                    Flexible(child: projectState(project)),
                    const SizedBox(width: 8),
                  ],
                  if (project['created_at'] != null)
                    Flexible(child: Text('Started ${day(project['created_at'])}',
                        overflow: TextOverflow.ellipsis, style: const TextStyle(color: muted, fontSize: 13))),
                ]),
                if (busy(project)) _Working(project: project, onCancel: project['cancel_requested'] == true || working
                    ? null
                    : () => act(() => widget.api.call('POST', '/projects/${widget.id}/cancel'))),
                if (project['status'] == 'failed' || project['status'] == 'cancelled')
                  Padding(padding: const EdgeInsets.only(top: 20), child: _Ended(project: project)),
                if (project['status'] == 'completed') ...[
                  const SizedBox(height: 20),
                  _Results(
                    project: project,
                    working: working,
                    onApproveAll: () => approveAll(clips),
                    onCalendar: openCalendar,
                    onDownload: download,
                  ),
                ],
                for (final clip in clips)
                  Padding(padding: const EdgeInsets.only(top: 16), child: ClipCard(
                    key: ValueKey(clip['idx']), clip: clip, posts: postsFor(clip['idx']),
                    review: (review) => act(() async {
                      await widget.api.call('PATCH', '/projects/${widget.id}/clips/${clip['idx']}', {'review': review});
                    }),
                    edit: () => openSheet(ClipEditor(api: widget.api, projectId: widget.id, clip: clip)),
                    publish: () => openSheet(PublishSheet(
                      api: widget.api, projectId: widget.id, clip: clip,
                      taken: postsFor(clip['idx']), until: project['schedule_until'])),
                    onPosts: load,
                    api: widget.api,
                  )),
              ]),
            );
          },
        ),
      );
}

/// While the backend works: the picture filling up, the step it is on, and a way to stop.
class _Working extends StatelessWidget {
  const _Working({required this.project, this.onCancel});
  final Map project;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final current = steps.indexWhere((step) => step.$1 == project['status']); // -1 while it waits in the queue
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const SizedBox(height: 20),
      if (project['thumbnail'] != null)
        Center(child: ClipLoading(src: project['thumbnail'], progress: project['progress'] ?? 0)),
      const SizedBox(height: 20),
      Text(project['cancel_requested'] == true ? 'Cancelling...' : '${project['message']}',
          style: Theme.of(context).textTheme.headlineSmall),
      const SizedBox(height: 14),
      ProgressBar(project['progress']),
      if ('${project['detail'] ?? ''}'.isNotEmpty)
        Padding(padding: const EdgeInsets.only(top: 8), child: Text(
          '${project['detail']}'[0].toUpperCase() + '${project['detail']}'.substring(1),
          style: const TextStyle(color: muted))),
      const SizedBox(height: 20),
      Panel(child: Column(children: [
        for (final (i, (_, label)) in steps.indexed) ...[
          if (i > 0) const SizedBox(height: 14),
          Row(children: [
            Container(
              width: 26, height: 26, alignment: Alignment.center,
              decoration: BoxDecoration(
                color: i < current ? accent : i == current ? accentSoft : ground,
                shape: BoxShape.circle,
                border: i == current ? Border.all(color: accent, width: 1.5) : null,
              ),
              child: i < current
                  ? Icon(PhosphorIconsBold.check, size: 13, color: Colors.white)
                  : Text('${i + 1}', style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600, color: i == current ? accentInk : muted)),
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: TextStyle(
              fontSize: 14.5, fontWeight: i == current ? FontWeight.w500 : FontWeight.w400, color: i > current ? muted : ink))),
            if (i < current) const Text('Done', style: TextStyle(color: muted, fontSize: 12.5)),
            if (i == current) const Text('Now', style: TextStyle(color: accentInk, fontSize: 12.5, fontWeight: FontWeight.w500)),
          ]),
        ],
      ])),
      const SizedBox(height: 12),
      const Text('You can close the app. Your clips keep processing.', style: TextStyle(color: muted, fontSize: 13)),
      const SizedBox(height: 14),
      Align(alignment: Alignment.centerLeft, child: OutlinedButton(
        onPressed: onCancel,
        child: Text(project['cancel_requested'] == true ? 'Cancelling...' : 'Cancel'),
      )),
    ]);
  }
}

/// A project that stopped: what happened, and what to do about it.
class _Ended extends StatelessWidget {
  const _Ended({required this.project});
  final Map project;

  @override
  Widget build(BuildContext context) {
    final failed = project['status'] == 'failed';
    final detail = '${project['detail'] ?? ''}';
    return Panel(padding: const EdgeInsets.all(24), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Message(
        icon: failed ? PhosphorIconsFill.warningCircle : PhosphorIconsBold.prohibit,
        tone: failed ? danger : muted,
        title: '${project['message']}',
        body: detail.isNotEmpty
            ? detail[0].toUpperCase() + detail.substring(1)
            : failed
                ? "We couldn't make clips from this video. Check that the link plays in a browser, or upload the file instead."
                : null,
      ),
      if ('${project['error'] ?? ''}'.isNotEmpty) ...[
        const SizedBox(height: 8),
        _Details(text: '${project['error']}'),
      ],
    ]));
  }
}

/// What went wrong underneath, for when someone asks us: hidden until it is asked for.
class _Details extends StatefulWidget {
  const _Details({required this.text});
  final String text;

  @override
  State<_Details> createState() => _DetailsState();
}

class _DetailsState extends State<_Details> {
  bool open = false;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Align(alignment: Alignment.centerLeft, child: TextButton.icon(
          onPressed: () => setState(() => open = !open),
          style: TextButton.styleFrom(foregroundColor: muted),
          icon: Icon(open ? PhosphorIconsBold.caretUp : PhosphorIconsBold.caretDown, size: 14, color: muted),
          label: const Text('Technical details', style: TextStyle(fontSize: 13.5)),
        )),
        if (open)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: ground, borderRadius: fieldRadius),
            child: SelectableText(widget.text, style: const TextStyle(fontSize: 12.5, color: muted)),
          ),
      ]);
}

/// The summary above finished clips: how many, how many approved, and the things you do to all of them at once.
class _Results extends StatelessWidget {
  const _Results({required this.project, required this.working, required this.onApproveAll, required this.onCalendar, required this.onDownload});
  final Map project;
  final bool working;
  final VoidCallback onApproveAll, onCalendar, onDownload;

  @override
  Widget build(BuildContext context) {
    final clips = project['clips'] as List? ?? [];
    if (clips.isEmpty) {
      return const Panel(padding: EdgeInsets.all(24), child: Message(
        icon: PhosphorIconsFill.filmSlate,
        title: 'No clips in this video',
        body: 'Nothing in it was strong enough to stand on its own. Try a longer video, or one with more talking.',
      ));
    }
    final approved = clips.where((c) => c['review'] == 'approved').length;
    final pending = clips.where((c) => c['review'] == 'pending').length;
    final expires = project['files_expire_at'];
    final live = expires != null && DateTime.parse(expires).isAfter(DateTime.now());
    return Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Container(
          width: 44, height: 44, alignment: Alignment.center,
          decoration: BoxDecoration(color: accentSoft, borderRadius: BorderRadius.circular(14)),
          child: Icon(PhosphorIconsFill.checkCircle, size: 22, color: accent),
        ),
        const SizedBox(width: 14),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(plural(clips.length, 'clip'), style: Theme.of(context).textTheme.titleLarge),
          Text(
            approved == 0 ? 'None approved yet.' : approved == clips.length ? 'All approved.' : '$approved approved.',
            style: const TextStyle(color: muted, fontSize: 13.5),
          ),
        ])),
      ]),
      const SizedBox(height: 14),
      Text(
        live ? 'Files are ready until ${day(expires)}.' : 'The video files have expired; the text is still here.',
        style: const TextStyle(color: muted, fontSize: 13),
      ),
      const SizedBox(height: 16),
      Wrap(spacing: 8, runSpacing: 8, children: [
        if (pending > 0)
          OutlinedButton(onPressed: working ? null : onApproveAll, child: Text(working ? 'Working...' : 'Approve all')),
        OutlinedButton.icon(
          onPressed: onCalendar,
          icon: Icon(PhosphorIconsRegular.calendarBlank, size: 18, color: ink),
          label: const Text('Calendar'),
        ),
        if (live && clips.any((c) => c['review'] != 'rejected'))
          FilledButton.icon(
            onPressed: working ? null : onDownload,
            icon: Icon(PhosphorIconsBold.downloadSimple, size: 17, color: Colors.white),
            label: const Text('Download all'),
          ),
      ]),
    ]));
  }
}

class ClipCard extends StatefulWidget {
  const ClipCard({super.key, required this.clip, required this.review, this.edit, this.publish, this.posts = const [], this.onPosts, this.api});
  final Map clip;
  final void Function(String review) review;
  final VoidCallback? edit, publish;
  final List posts; // this clip's publications
  final VoidCallback? onPosts;
  final Api? api;

  @override
  State<ClipCard> createState() => _ClipCardState();
}

class _ClipCardState extends State<ClipCard> {
  VideoPlayerController? player;
  bool sharing = false;
  String platform = 'tiktok';

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

  /// Downloads a file of the clip and opens the phone's share sheet (save to gallery, send, post from another app).
  Future<void> share(String url, String name, String type) async {
    setState(() => sharing = true);
    try {
      final file = File('${Directory.systemTemp.path}/$name');
      final response = await HttpClient().getUrl(Uri.parse(url)).then((r) => r.close());
      if (response.statusCode != 200) throw "That file didn't download. Try again.";
      await response.pipe(file.openWrite());
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: type)], title: widget.clip['title']));
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
    final number = '${clip['idx']}'.padLeft(2, '0');
    return Container(
      decoration: BoxDecoration(
        color: surface,
        borderRadius: panelRadius,
        border: Border.all(color: review == 'approved' ? accent.withValues(alpha: 0.45) : line),
      ),
      clipBehavior: Clip.antiAlias,
      child: Opacity(
        opacity: review == 'rejected' ? 0.55 : 1,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (live)
            GestureDetector(onTap: play, child: AspectRatio(aspectRatio: 1, child: ColoredBox(color: ink, child: Stack(fit: StackFit.expand, children: [
              if (player?.value.isInitialized == true)
                FittedBox(fit: BoxFit.cover, child: SizedBox(width: player!.value.size.width, height: player!.value.size.height, child: VideoPlayer(player!)))
              else if (clip['thumbnail_url'] != null)
                Image.network(clip['thumbnail_url'], fit: BoxFit.cover, errorBuilder: (context, error, stack) => const SizedBox()),
              if (player?.value.isPlaying != true)
                Center(child: Container(
                  width: 56, height: 56, alignment: Alignment.center,
                  decoration: const BoxDecoration(color: Color(0xE6FFFFFF), shape: BoxShape.circle),
                  child: Icon(PhosphorIconsFill.play, size: 24, color: ink),
                )),
              Positioned(left: 12, top: 12, child: _TilePill('Clip $number')),
            ])))),
          Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Wrap(spacing: 6, runSpacing: 6, children: [
              if (!live) StatusChip('Clip $number', background: ground),
              if (clip['score'] != null) StatusChip('Score ${clip['score']}', background: ground),
              if (review == 'approved')
                StatusChip('Approved', background: accentSoft, color: accentInk, icon: PhosphorIconsBold.check),
              if (review == 'rejected') StatusChip('Rejected', background: ground, color: muted),
            ]),
            const SizedBox(height: 10),
            Text(clip['title'], style: Theme.of(context).textTheme.headlineSmall),
            if (clip['start_s'] != null && clip['end_s'] != null)
              Padding(padding: const EdgeInsets.only(top: 6), child: Text(
                '${clock(clip['start_s'])} to ${clock(clip['end_s'])} in the video · ${(clip['end_s'] - clip['start_s']).round()} seconds',
                style: const TextStyle(color: muted, fontSize: 12.5))),
            if ('${clip['hook'] ?? ''}'.isNotEmpty) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(color: accentSoft, borderRadius: BorderRadius.circular(8)),
                child: Text('Hook: ${clip['hook']}', style: const TextStyle(
                  fontSize: 13.5, fontWeight: FontWeight.w500, color: accentInk)),
              ),
            ],
            if ('${clip['description'] ?? ''}'.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(clip['description'], style: const TextStyle(fontSize: 14.5, height: 1.45)),
            ],
            if ('${clip['reason'] ?? ''}'.isNotEmpty)
              Padding(padding: const EdgeInsets.only(top: 6), child: Text(clip['reason'], style: const TextStyle(color: muted, fontSize: 13.5))),
            if (!live) const Padding(padding: EdgeInsets.only(top: 8), child: Text(
              "This clip's files have expired.", style: TextStyle(color: muted))),
            const SizedBox(height: 16),
            _Posts(
              clip: clip,
              platform: platform,
              onPlatform: (next) => setState(() => platform = next),
            ),
            if (live) ...[
              const SizedBox(height: 14),
              Row(children: [
                const Text('Files', style: TextStyle(fontSize: 13, color: muted)),
                const SizedBox(width: 10),
                for (final (label, url, name, type) in [
                  ('Video', clip['video_url'], 'clip-$number.mp4', 'video/mp4'),
                  ('Captions', clip['captions_url'], 'clip-$number.ass', 'text/plain'),
                  ('Picture', clip['thumbnail_url'], 'clip-$number.jpg', 'image/jpeg'),
                ])
                  if (url != null)
                    Padding(padding: const EdgeInsets.only(right: 6), child: ActionChip(
                      label: Text(label, style: const TextStyle(fontSize: 12.5)),
                      shape: const StadiumBorder(side: BorderSide(color: line)),
                      backgroundColor: ground,
                      onPressed: sharing ? null : () => share(url, name, type),
                    )),
              ]),
            ],
            const SizedBox(height: 14),
            Wrap(spacing: 8, runSpacing: 8, children: [
              review == 'approved'
                  ? FilledButton.icon(
                      onPressed: () => widget.review('pending'),
                      icon: Icon(PhosphorIconsBold.check, size: 16, color: Colors.white),
                      label: const Text('Approved'))
                  : OutlinedButton(onPressed: () => widget.review('approved'), child: const Text('Approve')),
              review == 'rejected'
                  ? FilledButton(
                      style: FilledButton.styleFrom(backgroundColor: ink),
                      onPressed: () => widget.review('pending'),
                      child: const Text('Rejected'))
                  : OutlinedButton(onPressed: () => widget.review('rejected'), child: const Text('Reject')),
              if (widget.edit != null)
                OutlinedButton.icon(
                  onPressed: widget.edit,
                  icon: Icon(PhosphorIconsRegular.pencilSimple, size: 17, color: ink),
                  label: const Text('Edit')),
              if (widget.publish != null && live && review == 'approved')
                FilledButton.icon(
                  onPressed: widget.publish,
                  icon: Icon(PhosphorIconsFill.paperPlaneTilt, size: 16, color: Colors.white),
                  label: const Text('Publish')),
            ]),
            if (widget.posts.isNotEmpty && widget.api != null) ...[
              const SizedBox(height: 4),
              PostList(api: widget.api!, posts: widget.posts, onChange: widget.onPosts ?? () {}),
            ],
          ])),
        ]),
      ),
    );
  }
}

/// The post written for each platform, one at a time, with a button that copies it.
class _Posts extends StatelessWidget {
  const _Posts({required this.clip, required this.platform, required this.onPlatform});
  final Map clip;
  final String platform;
  final ValueChanged<String> onPlatform;

  @override
  Widget build(BuildContext context) {
    final written = platforms.keys.where((key) => '${clip['posts']?[key] ?? ''}'.isNotEmpty).toList();
    if (written.isEmpty) return const SizedBox.shrink();
    final current = written.contains(platform) ? platform : written.first;
    return Container(
      decoration: BoxDecoration(color: ground, borderRadius: cardRadius),
      padding: const EdgeInsets.all(6),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(height: 36, child: ListView(scrollDirection: Axis.horizontal, children: [
          for (final key in written)
            Padding(padding: const EdgeInsets.only(right: 4), child: Material(
              color: key == current ? surface : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => onPlatform(key),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Text(platforms[key]!, style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500, color: key == current ? ink : muted)),
                ),
              ),
            )),
        ])),
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 10, 8, 0),
          child: Text('${clip['posts'][current]}', style: const TextStyle(fontSize: 14, height: 1.45)),
        ),
        Align(alignment: Alignment.centerLeft, child: TextButton.icon(
          onPressed: () async {
            await Clipboard.setData(ClipboardData(text: '${clip['posts'][current]}'));
            if (context.mounted) toast(context, '${platforms[current]} post copied');
          },
          icon: Icon(PhosphorIconsRegular.copy, size: 16, color: accentInk),
          label: Text('Copy ${platforms[current]} post'),
        )),
      ]),
    );
  }
}
