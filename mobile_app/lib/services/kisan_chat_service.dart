import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'mesh_service.dart';

/// Kisan Chat — offline farmer-to-farmer chat carried over the P2P mesh.
///
/// • Farmers chat inside **communities** (village groups). A farmer can create
///   a new community or join an existing farmer-made one.
/// • Messages are stored locally (SharedPreferences) so the full history is
///   visible OFFLINE, even after the app is restarted.
/// • Every message the farmer sends is also broadcast through [MeshService],
///   the existing peer-to-peer transport, so nearby devices can relay it.
///
/// Two persisted stores keep the feature modular and Flutter-ready:
///   • [_communityKey]  → the list of communities (create / join)
///   • [_storageKey]    → all messages, each tagged with a [ChatMessage.communityId]
class KisanChatService {
  static final KisanChatService _instance = KisanChatService._internal();
  factory KisanChatService() => _instance;
  KisanChatService._internal();

  static const String _storageKey = 'kisan_chat_messages_v1';
  static const String _communityKey = 'kisan_communities_v1';

  /// The default village group (existing seed conversation lives here).
  static const String defaultCommunityId = 'village-sonipat';

  final MeshService _mesh = MeshService();
  final List<ChatMessage> _messages = [];
  final List<KisanCommunity> _communities = [];
  bool _loaded = false;
  bool _communitiesLoaded = false;

  // Current farmer identity (matches the app persona).
  static const String myId = 'rameshwar-singh';
  static const String myName = 'Rameshwar Singh';

  List<ChatMessage> get messages => List.unmodifiable(_messages);
  List<KisanCommunity> get communities => List.unmodifiable(_communities);

  /// Communities the farmer has joined (shown under "My Communities").
  List<KisanCommunity> get joinedCommunities =>
      _communities.where((c) => c.joined).toList();

  /// Farmer-made communities available to join ("Discover").
  List<KisanCommunity> get discoverCommunities =>
      _communities.where((c) => !c.joined).toList();

  // ---------------------------------------------------------------------------
  // Communities
  // ---------------------------------------------------------------------------

  /// Load stored communities. Seeds a starter set on first run so the list is
  /// never empty (the default village group is pre-joined).
  Future<List<KisanCommunity>> loadCommunities() async {
    if (_communitiesLoaded) return communities;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_communityKey);
      if (raw != null && raw.isNotEmpty) {
        final list = jsonDecode(raw) as List;
        _communities
          ..clear()
          ..addAll(list.map((e) =>
              KisanCommunity.fromJson(Map<String, dynamic>.from(e as Map))));
      }
    } catch (_) {
      // Corrupt/empty store — fall through to seed.
    }
    if (_communities.isEmpty) {
      _communities.addAll(_seedCommunities());
      await _persistCommunities();
    }
    _communitiesLoaded = true;
    return communities;
  }

  KisanCommunity? communityById(String id) {
    for (final c in _communities) {
      if (c.id == id) return c;
    }
    return null;
  }

  /// Messages that belong to a given community (chat history, offline-visible).
  List<ChatMessage> messagesFor(String communityId) =>
      _messages.where((m) => m.communityId == communityId).toList();

  ChatMessage? lastMessageFor(String communityId) {
    final list = messagesFor(communityId);
    return list.isEmpty ? null : list.last;
  }

  /// Create a new community (made by the current farmer). Auto-joined, and a
  /// friendly welcome message is posted so the group is not empty.
  Future<KisanCommunity> createCommunity({
    required String name,
    String topic = '',
    String emoji = '🌾',
  }) async {
    final community = KisanCommunity(
      id: 'c-${DateTime.now().millisecondsSinceEpoch}',
      name: name.trim(),
      topic: topic.trim().isEmpty ? 'नया समुदाय' : topic.trim(),
      emoji: emoji,
      createdBy: myName,
      memberCount: 1,
      joined: true,
    );
    _communities.insert(0, community);
    await _persistCommunities();

    final welcome = ChatMessage(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      communityId: community.id,
      senderId: myId,
      senderName: myName,
      text:
          'नमस्ते! Maine "${community.name}" samuday banaya hai. Kisaan bhai judein aur charcha karein. 🌾',
      timestamp: DateTime.now(),
      isMe: true,
    );
    _messages.add(welcome);
    await _persist();
    return community;
  }

  /// Join an existing farmer-made community.
  Future<void> joinCommunity(String communityId) async {
    final c = communityById(communityId);
    if (c != null && !c.joined) {
      c.joined = true;
      c.memberCount += 1;
      await _persistCommunities();
    }
  }

  Future<void> _persistCommunities() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _communityKey,
        jsonEncode(_communities.map((c) => c.toJson()).toList()),
      );
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Messages
  // ---------------------------------------------------------------------------

  /// Load stored messages (older chats, available offline). Seeds a starter
  /// village conversation on first run so the groups are never empty.
  Future<List<ChatMessage>> load() async {
    if (_loaded) return messages;
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw != null && raw.isNotEmpty) {
        final list = jsonDecode(raw) as List;
        _messages
          ..clear()
          ..addAll(list.map(
              (e) => ChatMessage.fromJson(Map<String, dynamic>.from(e as Map))));
      }
    } catch (_) {
      // Corrupt/empty store — fall through to seed.
    }

    if (_messages.isEmpty) {
      _messages.addAll(_seedConversation());
      await _persist();
    }
    _loaded = true;
    return messages;
  }

  /// Send a message from the current farmer into [communityId]. Persists it and
  /// broadcasts it over the P2P mesh transport.
  Future<ChatMessage> sendMessage(
    String text, {
    String communityId = defaultCommunityId,
  }) async {
    final clean = text.trim();
    final msg = ChatMessage(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      communityId: communityId,
      senderId: myId,
      senderName: myName,
      text: clean,
      timestamp: DateTime.now(),
      isMe: true,
    );
    _messages.add(msg);
    await _persist();

    // Push out over the mesh (real code path; radio layer is stubbed for demo).
    try {
      final packet = MeshPacket(
        originDeviceId: myId,
        packetType: 'chat',
        payload: {
          'community': communityId,
          'name': myName,
          'text': clean,
          'ts': msg.timestamp.toIso8601String(),
        },
        payloadHash: msg.id,
        priority: 2,
      );
      await _mesh.broadcastPacket(packet);
    } catch (_) {}

    return msg;
  }

  /// Record an incoming message from a peer farmer (arrives over the mesh).
  Future<ChatMessage> receiveMessage({
    required String senderId,
    required String senderName,
    required String text,
    String communityId = defaultCommunityId,
  }) async {
    final msg = ChatMessage(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      communityId: communityId,
      senderId: senderId,
      senderName: senderName,
      text: text,
      timestamp: DateTime.now(),
      isMe: false,
    );
    _messages.add(msg);
    await _persist();
    return msg;
  }

  /// Demo helper: generate a contextual reply from a nearby farmer so the
  /// two-way discussion is visible on a single device. On real hardware this
  /// same message would arrive from a peer over the mesh instead.
  Future<ChatMessage> simulatePeerReply(
    String toText, {
    String communityId = defaultCommunityId,
  }) async {
    final peer = _peers[DateTime.now().second % _peers.length];
    return receiveMessage(
      senderId: peer[0],
      senderName: peer[1],
      text: _replyFor(toText),
      communityId: communityId,
    );
  }

  /// Clear the messages of a single community (keeps other communities intact).
  Future<void> clearCommunity(String communityId) async {
    _messages.removeWhere((m) => m.communityId == communityId);
    await _persist();
  }

  /// Clear all messages (used by a full reset action).
  Future<void> clearAll() async {
    _messages.clear();
    _loaded = false;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_storageKey);
    } catch (_) {}
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _storageKey,
        jsonEncode(_messages.map((m) => m.toJson()).toList()),
      );
    } catch (_) {}
  }

  static const List<List<String>> _peers = [
    ['jagbir-singh', 'Jagbir Singh'],
    ['mukesh-sharma', 'Mukesh Sharma'],
    ['suresh-yadav', 'Suresh Yadav'],
  ];

  String _replyFor(String text) {
    final q = text.toLowerCase();
    if (q.contains('रतुआ') ||
        q.contains('rust') ||
        q.contains('पीला') ||
        q.contains('gehu') ||
        q.contains('गेहूं') ||
        q.contains('wheat')) {
      return 'Bhai mere khet mein bhi pila ratua dikha tha. Propiconazole 25% EC @ 1ml/litre pani spray karo — 200ml prati acre. HD-3086 kism rog-rodhak hai.';
    }
    if (q.contains('धान') ||
        q.contains('rice') ||
        q.contains('झुलसा') ||
        q.contains('blast') ||
        q.contains('paddy')) {
      return 'Dhan ke jhulsa ke liye Tricyclazole 75% WP @ 0.6g/litre spray karo. Khet se extra pani nikal do.';
    }
    if (q.contains('कपास') ||
        q.contains('cotton') ||
        q.contains('सुंडी') ||
        q.contains('bollworm')) {
      return 'Gulabi sundi ke liye pheromone trap lagao — 8 prati acre. Emamectin benzoate 5% SG bhi asardar hai.';
    }
    if (q.contains('bhav') ||
        q.contains('भाव') ||
        q.contains('mandi') ||
        q.contains('मंडी') ||
        q.contains('price') ||
        q.contains('rate')) {
      return 'Aaj mandi mein bhav theek chal raha hai. Subah jaldi lekar jao to behtar rate milta hai.';
    }
    if (q.contains('मौसम') ||
        q.contains('weather') ||
        q.contains('barish') ||
        q.contains('बारिश') ||
        q.contains('rain')) {
      return 'Agle 2 din halki barish ka anuman hai. Spray karna hai to aaj hi kar lo.';
    }
    if (q.contains('ram-ram') ||
        q.contains('namaste') ||
        q.contains('नमस्ते') ||
        q.contains('hello') ||
        q.contains('hi ')) {
      return 'Ram-Ram bhai! Khet ka kya haal hai?';
    }
    return 'Sahi kaha bhai. Hamare gaon mein bhi aisa hi chal raha hai. Aur koi jankari chahiye to batao.';
  }

  List<KisanCommunity> _seedCommunities() => [
        KisanCommunity(
          id: 'village-sonipat',
          name: 'सोनीपत गाँव समूह',
          topic: 'सामान्य चर्चा · गेहूँ/सरसों',
          emoji: '🌾',
          createdBy: 'Jagbir Singh',
          memberCount: 12,
          joined: true,
        ),
        KisanCommunity(
          id: 'wheat-disease',
          name: 'गेहूँ रोग चर्चा',
          topic: 'रोग व उपचार',
          emoji: '🦠',
          createdBy: 'Suresh Yadav',
          memberCount: 38,
          joined: false,
        ),
        KisanCommunity(
          id: 'mandi-bhav',
          name: 'मंडी भाव अपडेट',
          topic: 'रोज़ के दाम',
          emoji: '📈',
          createdBy: 'Mukesh Sharma',
          memberCount: 54,
          joined: false,
        ),
        KisanCommunity(
          id: 'organic',
          name: 'जैविक खेती',
          topic: 'ऑर्गैनिक तरीके',
          emoji: '🌱',
          createdBy: 'Rajbir Dhaka',
          memberCount: 21,
          joined: false,
        ),
      ];

  List<ChatMessage> _seedConversation() {
    final now = DateTime.now();
    ChatMessage m(int minAgo, String cid, String id, String name, String text,
            {bool me = false}) =>
        ChatMessage(
          id: 'seed-$cid-$id-$minAgo',
          communityId: cid,
          senderId: id,
          senderName: name,
          text: text,
          timestamp: now.subtract(Duration(minutes: minAgo)),
          isMe: me,
        );
    return [
      // --- सोनीपत गाँव समूह (default) ---
      m(180, 'village-sonipat', 'jagbir-singh', 'Jagbir Singh',
          'Ram-Ram kisaan bhaiyo! Mera gehu 45 din ka ho gaya. Kal halki sinchai ki thi, nami badhiya ban gayi.'),
      m(150, 'village-sonipat', 'mukesh-sharma', 'Mukesh Sharma',
          'Ram-Ram! Rai mandi mein aaj sarson ₹5,450/qtl chal raha hai. Kisaan bhai dhyan dein.'),
      m(90, 'village-sonipat', 'suresh-yadav', 'Suresh Yadav',
          'Bhaiyo, mere gehu ki patti par pile dhabbe aa rahe hain. Kya yeh pila ratua hai?'),
      m(80, 'village-sonipat', 'rameshwar-singh', 'Rameshwar Singh',
          'Haan Suresh bhai, lagta to pila ratua (Yellow Rust) hi hai. Kaunsi kism boyi thi?',
          me: true),
      m(60, 'village-sonipat', 'jagbir-singh', 'Jagbir Singh',
          'Propiconazole 25% EC @ 1ml/litre pani spray karo — 200ml prati acre. 15 din baad dobara. HD-3086 rog-rodhak kism hai.'),
      // --- गेहूँ रोग चर्चा ---
      m(200, 'wheat-disease', 'suresh-yadav', 'Suresh Yadav',
          'Is group mein sirf rog aur upchar ki baat karein. Patti ki photo bhi daal sakte ho.'),
      m(120, 'wheat-disease', 'jagbir-singh', 'Jagbir Singh',
          'Pila ratua ke liye Propiconazole sabse asardar hai. Subah-subah spray karo.'),
      // --- मंडी भाव अपडेट ---
      m(240, 'mandi-bhav', 'mukesh-sharma', 'Mukesh Sharma',
          'Aaj ke bhav — Sarson ₹5,450, Gehu ₹2,275, Chana ₹5,100 prati qtl.'),
      m(60, 'mandi-bhav', 'jagbir-singh', 'Jagbir Singh',
          'Sonipat mandi mein gehu ka rate aaj thoda upar hai.'),
      // --- जैविक खेती ---
      m(300, 'organic', 'rajbir-dhaka', 'Rajbir Dhaka',
          'Jeevamrut aur neem khali se acchi paidawar mil rahi hai. Rasayan kam karo bhaiyo.'),
    ];
  }
}

/// A farmer community (village group) inside Kisan Chat.
class KisanCommunity {
  final String id;
  final String name;
  final String topic;
  final String emoji;
  final String createdBy;
  int memberCount;
  bool joined;

  KisanCommunity({
    required this.id,
    required this.name,
    required this.topic,
    required this.emoji,
    required this.createdBy,
    this.memberCount = 1,
    this.joined = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'topic': topic,
        'emoji': emoji,
        'createdBy': createdBy,
        'memberCount': memberCount,
        'joined': joined,
      };

  factory KisanCommunity.fromJson(Map<String, dynamic> j) => KisanCommunity(
        id: (j['id'] ?? '').toString(),
        name: (j['name'] ?? 'समुदाय').toString(),
        topic: (j['topic'] ?? '').toString(),
        emoji: (j['emoji'] ?? '🌾').toString(),
        createdBy: (j['createdBy'] ?? 'Kisan').toString(),
        memberCount: (j['memberCount'] is int)
            ? j['memberCount'] as int
            : int.tryParse('${j['memberCount']}') ?? 1,
        joined: j['joined'] == true,
      );
}

/// A single chat message inside a community.
class ChatMessage {
  final String id;
  final String communityId;
  final String senderId;
  final String senderName;
  final String text;
  final DateTime timestamp;
  final bool isMe;

  ChatMessage({
    required this.id,
    required this.senderId,
    required this.senderName,
    required this.text,
    required this.timestamp,
    required this.isMe,
    this.communityId = KisanChatService.defaultCommunityId,
  });

  /// Two-letter avatar initials from the sender name.
  String get initials {
    final parts = senderName.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2 && parts[0].isNotEmpty && parts[1].isNotEmpty) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return senderName.isNotEmpty ? senderName[0].toUpperCase() : '?';
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'communityId': communityId,
        'senderId': senderId,
        'senderName': senderName,
        'text': text,
        'timestamp': timestamp.toIso8601String(),
        'isMe': isMe,
      };

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: (j['id'] ?? '').toString(),
        // Migration: messages saved before communities default to the village group.
        communityId: (j['communityId'] ?? KisanChatService.defaultCommunityId)
            .toString(),
        senderId: (j['senderId'] ?? '').toString(),
        senderName: (j['senderName'] ?? 'Kisan').toString(),
        text: (j['text'] ?? '').toString(),
        timestamp:
            DateTime.tryParse(j['timestamp']?.toString() ?? '') ?? DateTime.now(),
        isMe: j['isMe'] == true,
      );
}
