import 'package:flutter/material.dart';
import '../../services/kisan_chat_service.dart';
import '../../utils/design_tokens.dart';

/// Kisan Chat — offline farmer-to-farmer chat over the P2P mesh.
///
/// Farmers browse **communities** (village groups): create a new one, join a
/// farmer-made one, or open a joined community to chat. Selecting a community
/// drills into the chat; the back arrow returns to the community list.
///
/// The class is intentionally still named [MeshScreen] so existing navigation
/// and routes across the app keep working unchanged.
class MeshScreen extends StatefulWidget {
  const MeshScreen({super.key});

  @override
  State<MeshScreen> createState() => _MeshScreenState();
}

class _MeshScreenState extends State<MeshScreen> {
  final KisanChatService _chat = KisanChatService();
  final TextEditingController _controller = TextEditingController();
  final ScrollController _scroll = ScrollController();

  static const List<String> _emojiChoices = [
    '🌾', '🌱', '🦠', '📈', '🚜', '💧', '🐄', '🥭'
  ];

  bool _loading = true;
  bool _peerTyping = false;

  /// null → show the communities list; otherwise show that community's chat.
  String? _activeCommunityId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    await _chat.loadCommunities();
    await _chat.load();
    if (!mounted) return;
    setState(() => _loading = false);
  }

  @override
  void dispose() {
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent + 80,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _openCommunity(String id) {
    setState(() => _activeCommunityId = id);
    _scrollToBottom();
  }

  void _backToList() {
    setState(() {
      _activeCommunityId = null;
      _peerTyping = false;
    });
  }

  Future<void> _join(String id) async {
    await _chat.joinCommunity(id);
    if (mounted) setState(() {});
  }

  Future<void> _send() async {
    final id = _activeCommunityId;
    if (id == null) return;
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    _controller.clear();

    await _chat.sendMessage(text, communityId: id);
    if (!mounted) return;
    setState(() => _peerTyping = true);
    _scrollToBottom();

    // A nearby farmer replies over the mesh (simulated on a single device).
    await Future.delayed(const Duration(milliseconds: 1300));
    await _chat.simulatePeerReply(text, communityId: id);
    if (!mounted) return;
    setState(() => _peerTyping = false);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    if (_activeCommunityId == null) return _buildCommunitiesScaffold();
    return _buildChatScaffold();
  }

  // ---------------------------------------------------------------------------
  // Communities list
  // ---------------------------------------------------------------------------

  Widget _buildCommunitiesScaffold() {
    final joined = _chat.joinedCommunities;
    final discover = _chat.discoverCommunities;
    return Scaffold(
      backgroundColor: colorBg,
      appBar: buildKrishiAppBar(
        context: context,
        title: 'Kisan Chat',
        subtitle: 'समुदाय · Communities (P2P मेश)',
        emoji: '🌾',
        actions: [_statusPill('ऑफ़लाइन')],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: colorPrimary))
          : ListView(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 24),
              children: [
                _createButton(),
                _sectionTitle('मेरे समुदाय (My Communities)', joined.length),
                if (joined.isEmpty)
                  _emptyLine('अभी कोई समुदाय नहीं — नीचे से join karein ya naya banayein.')
                else
                  ...joined.map(_communityCard),
                const SizedBox(height: 8),
                if (discover.isNotEmpty) ...[
                  _sectionTitle('समुदाय खोजें (किसानों द्वारा बनाए)', discover.length),
                  ...discover.map(_discoverCard),
                ],
              ],
            ),
    );
  }

  Widget _createButton() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: GestureDetector(
        onTap: _openCreateSheet,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 14),
          decoration: BoxDecoration(
            color: colorPrimary,
            borderRadius: BorderRadius.circular(radiusLg),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.add_rounded, color: Colors.white, size: 20),
              SizedBox(width: 8),
              Text(
                'नया समुदाय बनाएँ (Create Community)',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _sectionTitle(String text, int count) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(2, 18, 0, 9),
      child: Row(
        children: [
          Text(
            text,
            style: const TextStyle(
              fontSize: 11.5,
              fontWeight: FontWeight.w800,
              color: colorStoneText,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '· $count',
            style: const TextStyle(fontSize: 11, color: colorStoneMuted),
          ),
        ],
      ),
    );
  }

  Widget _emptyLine(String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 11.5, color: colorStoneMuted),
      ),
    );
  }

  Widget _communityCard(KisanCommunity c) {
    final last = _chat.lastMessageFor(c.id);
    final lastText = last == null
        ? 'कोई संदेश नहीं'
        : '${last.isMe ? 'आप' : last.senderName.split(' ').first}: ${last.text}';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: GestureDetector(
        onTap: () => _openCommunity(c.id),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colorCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: colorHairline),
          ),
          child: Row(
            children: [
              _communityIcon(c.emoji),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: colorStoneText)),
                    const SizedBox(height: 1),
                    Text(c.topic,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11, color: colorStoneMuted)),
                    const SizedBox(height: 4),
                    Text(lastText,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 11.5, color: colorStoneText)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('👥 ${c.memberCount}',
                      style: const TextStyle(
                          fontSize: 10, color: colorStoneMuted)),
                  const SizedBox(height: 6),
                  const Text('✓ शामिल',
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: colorMeshActive)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _discoverCard(KisanCommunity c) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: colorCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: colorHairline),
        ),
        child: Row(
          children: [
            _communityIcon(c.emoji),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(c.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: colorStoneText)),
                  const SizedBox(height: 1),
                  Text(c.topic,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, color: colorStoneMuted)),
                  const SizedBox(height: 4),
                  Text('बनाया: ${c.createdBy}',
                      style: const TextStyle(
                          fontSize: 9.5, color: colorStoneMuted)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text('👥 ${c.memberCount}',
                    style: const TextStyle(
                        fontSize: 10, color: colorStoneMuted)),
                const SizedBox(height: 6),
                GestureDetector(
                  onTap: () => _join(c.id),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 7),
                    decoration: BoxDecoration(
                      color: colorMeshActiveBg,
                      borderRadius: BorderRadius.circular(radiusFull),
                      border: Border.all(color: colorMeshBorder),
                    ),
                    child: const Text('＋ शामिल',
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            color: colorMeshActive)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _communityIcon(String emoji) {
    return Container(
      width: 46,
      height: 46,
      decoration: BoxDecoration(
        color: colorPrimarySoft,
        borderRadius: BorderRadius.circular(14),
      ),
      alignment: Alignment.center,
      child: Text(emoji, style: const TextStyle(fontSize: 22)),
    );
  }

  Widget _statusPill(String text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: colorMeshActiveBg,
        borderRadius: BorderRadius.circular(radiusFull),
        border: Border.all(color: colorMeshBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.circle, size: 8, color: colorMeshActive),
          const SizedBox(width: 4),
          Text(
            text,
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: colorMeshActive,
            ),
          ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Create-community bottom sheet
  // ---------------------------------------------------------------------------

  Future<void> _openCreateSheet() async {
    final nameC = TextEditingController();
    final topicC = TextEditingController();
    String emoji = _emojiChoices.first;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(sheetCtx).viewInsets.bottom),
        child: StatefulBuilder(
          builder: (sheetCtx, setSheet) => Container(
            decoration: const BoxDecoration(
              color: colorSurface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
            ),
            padding: const EdgeInsets.fromLTRB(16, 18, 16, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('नया समुदाय बनाएँ',
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: colorStoneText)),
                const SizedBox(height: 3),
                const Text(
                    'Create a farmer community — दूसरे kisaan bhai ise join kar sakte hain.',
                    style: TextStyle(fontSize: 11, color: colorStoneMuted)),
                const SizedBox(height: 14),
                _sheetLabel('समुदाय का नाम (Community name)'),
                _sheetField(nameC, 'जैसे: सोनीपत गन्ना किसान', 40),
                const SizedBox(height: 12),
                _sheetLabel('विषय (Topic / description)'),
                _sheetField(topicC, 'जैसे: गन्ना · कीट-रोग चर्चा', 50),
                const SizedBox(height: 12),
                _sheetLabel('आइकन चुनें (Pick an icon)'),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _emojiChoices.map((e) {
                    final sel = e == emoji;
                    return GestureDetector(
                      onTap: () => setSheet(() => emoji = e),
                      child: Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: sel ? colorPrimarySoft : colorCard,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: sel ? colorPrimary : colorHairline),
                        ),
                        alignment: Alignment.center,
                        child: Text(e, style: const TextStyle(fontSize: 20)),
                      ),
                    );
                  }).toList(),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: GestureDetector(
                        onTap: () => Navigator.of(sheetCtx).pop(),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: colorBg,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: colorHairline),
                          ),
                          alignment: Alignment.center,
                          child: const Text('रद्द करें',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: colorStoneText)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: GestureDetector(
                        onTap: () async {
                          final name = nameC.text.trim();
                          if (name.isEmpty) return;
                          final c = await _chat.createCommunity(
                            name: name,
                            topic: topicC.text.trim(),
                            emoji: emoji,
                          );
                          if (!mounted) return;
                          Navigator.of(sheetCtx).pop();
                          _openCommunity(c.id);
                        },
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: colorPrimary,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          alignment: Alignment.center,
                          child: const Text('बनाएँ ＋',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white)),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );

    nameC.dispose();
    topicC.dispose();
  }

  Widget _sheetLabel(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Text(text,
            style: const TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: colorStoneText)),
      );

  Widget _sheetField(TextEditingController c, String hint, int maxLen) {
    return Container(
      decoration: BoxDecoration(
        color: colorCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorHairline),
      ),
      child: TextField(
        controller: c,
        maxLength: maxLen,
        style: const TextStyle(fontSize: 14, color: colorStoneText),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(fontSize: 13, color: colorStoneMuted),
          border: InputBorder.none,
          counterText: '',
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Chat (scoped to the active community)
  // ---------------------------------------------------------------------------

  Widget _buildChatScaffold() {
    final id = _activeCommunityId!;
    final community = _chat.communityById(id);
    final messages = _chat.messagesFor(id);
    return Scaffold(
      backgroundColor: colorBg,
      appBar: buildKrishiAppBar(
        context: context,
        title: community?.name ?? 'Kisan Chat',
        subtitle: '${community?.topic ?? 'गाँव समूह'} · P2P मेश',
        emoji: community?.emoji ?? '🌾',
        onBack: _backToList,
        actions: [_statusPill('${community?.memberCount ?? 0} सदस्य')],
      ),
      body: Column(
        children: [
          // Offline / mesh banner
          Container(
            width: double.infinity,
            color: colorPrimarySoft,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: const Row(
              children: [
                Icon(Icons.wifi_off_rounded, size: 14, color: colorPrimary),
                SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'ऑफ़लाइन मेश पर सुरक्षित · पुराने संदेश बिना इंटरनेट दिखते हैं',
                    style: TextStyle(
                      fontSize: 11,
                      color: colorPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: messages.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(horizontal: 30),
                      child: Text(
                        'अभी कोई संदेश नहीं — पहला संदेश भेजकर charcha shuru karein 🌾',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: colorStoneMuted),
                      ),
                    ),
                  )
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(12, 12, 12, 4),
                    itemCount: messages.length + (_peerTyping ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i >= messages.length) return _typingBubble();
                      return _bubble(messages[i]);
                    },
                  ),
          ),
          _composer(),
        ],
      ),
    );
  }

  Widget _bubble(ChatMessage m) {
    final isMe = m.isMe;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        mainAxisAlignment:
            isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isMe) ...[_avatar(m), const SizedBox(width: 8)],
          Flexible(
            child: Container(
              constraints: BoxConstraints(
                maxWidth: MediaQuery.of(context).size.width * 0.72,
              ),
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: isMe ? colorPrimary : colorCard,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(14),
                  topRight: const Radius.circular(14),
                  bottomLeft: Radius.circular(isMe ? 14 : 4),
                  bottomRight: Radius.circular(isMe ? 4 : 14),
                ),
                border: isMe ? null : Border.all(color: colorHairline),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (!isMe)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Text(
                        m.senderName,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: colorPrimaryLight,
                        ),
                      ),
                    ),
                  Text(
                    m.text,
                    style: TextStyle(
                      fontSize: 13.5,
                      height: 1.35,
                      color: isMe ? Colors.white : colorStoneText,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _time(m.timestamp),
                        style: TextStyle(
                          fontSize: 9.5,
                          color: isMe ? Colors.white70 : colorStoneMuted,
                        ),
                      ),
                      if (isMe) ...[
                        const SizedBox(width: 4),
                        const Icon(Icons.done_all_rounded,
                            size: 12, color: Colors.white70),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (isMe) ...[const SizedBox(width: 8), _avatar(m)],
        ],
      ),
    );
  }

  Widget _avatar(ChatMessage m) {
    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        color: m.isMe ? colorPrimary : colorPrimarySoft,
        shape: BoxShape.circle,
        border: Border.all(color: colorHairline),
      ),
      alignment: Alignment.center,
      child: Text(
        m.initials,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          color: m.isMe ? Colors.white : colorPrimary,
        ),
      ),
    );
  }

  Widget _typingBubble() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: colorCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: colorHairline),
            ),
            child: const Text(
              'कोई किसान लिख रहा है…',
              style: TextStyle(
                fontSize: 12,
                fontStyle: FontStyle.italic,
                color: colorStoneMuted,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _composer() {
    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 8,
        bottom: 8 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: const BoxDecoration(
        color: colorSurface,
        border: Border(top: BorderSide(color: colorHairline)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: colorBg,
                borderRadius: BorderRadius.circular(radiusLg),
                border: Border.all(color: colorHairline),
              ),
              child: TextField(
                controller: _controller,
                minLines: 1,
                maxLines: 4,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(),
                style: const TextStyle(fontSize: 14, color: colorStoneText),
                decoration: const InputDecoration(
                  hintText: 'संदेश लिखें… (फसल, रोग, भाव)',
                  hintStyle: TextStyle(fontSize: 13, color: colorStoneMuted),
                  border: InputBorder.none,
                  contentPadding:
                      EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: _send,
            child: Container(
              width: touchTarget,
              height: touchTarget,
              decoration:
                  const BoxDecoration(color: colorPrimary, shape: BoxShape.circle),
              child: const Icon(Icons.send_rounded,
                  color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  String _time(DateTime t) {
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final m = t.minute.toString().padLeft(2, '0');
    final ap = t.hour < 12 ? 'AM' : 'PM';
    return '$h:$m $ap';
  }
}
