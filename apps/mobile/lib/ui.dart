import 'dart:async';

import 'package:flutter/material.dart';
import 'package:phosphor_icons/phosphor_icons.dart';

import 'main.dart';

/// Fetches on open and every few seconds while [busy] says the backend is still working, like the website's usePoll.
mixin Polling<T extends StatefulWidget> on State<T> {
  dynamic data;
  Object? error;
  Timer? _timer;

  Future<dynamic> fetch();
  bool busy(dynamic data) => false;
  Duration get every => const Duration(seconds: 3);

  Future<void> load() async {
    try {
      final fresh = await fetch();
      if (!mounted) return;
      setState(() {
        data = fresh;
        error = null;
      });
      _timer?.cancel();
      if (busy(fresh)) _timer = Timer(every, load);
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

  /// The loaded screen, or the waiting and failed states in its place.
  Widget loaded(Widget Function(dynamic data) build, {Widget? waiting}) {
    if (data != null) {
      return build(data);
    }
    if (error != null) {
      return Center(child: Padding(padding: const EdgeInsets.all(24), child: Message(
      icon: PhosphorIconsFill.warningCircle,
      title: "That didn't load",
      body: '$error',
      tone: danger,
        action: OutlinedButton(onPressed: load, child: const Text('Try again')),
      )));
    }
    return waiting ?? const Center(child: CircularProgressIndicator());
  }
}

/// A small rounded label: a project's state, a clip's score, a channel's problem.
class StatusChip extends StatelessWidget {
  const StatusChip(this.label, {super.key, this.background = line, this.color = ink, this.dot = false, this.icon});
  final String label;
  final Color background, color;
  final bool dot;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: ShapeDecoration(color: background, shape: const StadiumBorder(side: BorderSide(color: line))),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (dot) ...[const _Pulse(), const SizedBox(width: 6)],
          if (icon != null) ...[Icon(icon, size: 13, color: color), const SizedBox(width: 5)],
          Flexible(child: Text(label, overflow: TextOverflow.ellipsis, style: TextStyle(
            fontSize: 12.5, fontWeight: FontWeight.w500, color: color))),
        ]),
      );
}

/// A dot that breathes while the backend is working, like the website's animated status dot.
class _Pulse extends StatefulWidget {
  const _Pulse();

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat(reverse: true);

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.disableAnimationsOf(context)) return const _Dot(1);
    return FadeTransition(opacity: controller.drive(Tween(begin: 0.35, end: 1.0)), child: const _Dot(1));
  }
}

class _Dot extends StatelessWidget {
  const _Dot(this.opacity);
  final double opacity;

  @override
  Widget build(BuildContext context) => Container(
        width: 8, height: 8,
        decoration: BoxDecoration(color: accent.withValues(alpha: opacity), shape: BoxShape.circle),
      );
}

/// A bar with the percentage beside it, for uploads and processing.
class ProgressBar extends StatelessWidget {
  const ProgressBar(this.percent, {super.key, this.label = true});
  final int? percent;
  final bool label;

  @override
  Widget build(BuildContext context) => Row(children: [
        Expanded(child: TweenAnimationBuilder<double>(
          tween: Tween(end: (percent ?? 0) / 100),
          duration: const Duration(milliseconds: 600),
          curve: Curves.easeOutCubic,
          builder: (context, value, child) => LinearProgressIndicator(
            value: value, minHeight: 6, borderRadius: BorderRadius.circular(3)),
        )),
        if (label) ...[
          const SizedBox(width: 10),
          Text('${percent ?? 0}%', style: const TextStyle(
            fontSize: 12.5, color: muted, fontFeatures: [FontFeature.tabularFigures()])),
        ],
      ]);
}

/// An empty, failed or finished state: one icon, one line, one explanation, one way on.
class Message extends StatelessWidget {
  const Message({super.key, required this.icon, required this.title, this.body, this.action, this.tone = accent});
  final IconData icon;
  final String title;
  final String? body;
  final Widget? action;
  final Color tone;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 48, height: 48, alignment: Alignment.center,
          decoration: BoxDecoration(
            color: tone == danger ? dangerSoft : accentSoft, borderRadius: BorderRadius.circular(14)),
          child: Icon(icon, size: 24, color: tone),
        ),
        const SizedBox(height: 16),
        Text(title, style: Theme.of(context).textTheme.headlineSmall),
        if (body != null) ...[
          const SizedBox(height: 6),
          Text(body!, style: TextStyle(color: tone == danger ? danger : muted, fontSize: 14.5, height: 1.45)),
        ],
        if (action != null) ...[const SizedBox(height: 20), action!],
      ]);
}

/// A white panel: the app's main content container (24px, one hairline ring, no shadow).
class Panel extends StatelessWidget {
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(20), this.color = surface, this.ring = line});
  final Widget child;
  final EdgeInsets padding;
  final Color color, ring;

  @override
  Widget build(BuildContext context) => Container(
        decoration: BoxDecoration(color: color, borderRadius: panelRadius, border: Border.all(color: ring)),
        padding: padding,
        child: child,
      );
}

/// The heading above a list or grid, with a count beside it.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.title, {super.key, this.trailing});
  final String title;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(children: [
          Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
          ?trailing,
        ]),
      );
}

/// Grey blocks in the shape of what is coming, instead of a spinner over an empty screen.
class Skeleton extends StatelessWidget {
  const Skeleton({super.key, this.height = 16, this.width = double.infinity, this.radius = 8});
  final double height, width, radius;

  @override
  Widget build(BuildContext context) => Container(
        height: height, width: width,
        decoration: BoxDecoration(color: line, borderRadius: BorderRadius.circular(radius)),
      );
}

/// A round icon button that floats over a photo or sits in a header.
class RoundButton extends StatelessWidget {
  const RoundButton({super.key, required this.icon, required this.onPressed, this.tooltip, this.background = surface, this.color = ink, this.size = 44});
  final IconData icon;
  final VoidCallback? onPressed;
  final String? tooltip;
  final Color background, color;
  final double size;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: tooltip ?? '',
        child: Material(
          color: background, shape: const CircleBorder(), clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onPressed,
            child: SizedBox(width: size, height: size, child: Icon(icon, size: size * 0.45, color: color)),
          ),
        ),
      );
}
