class AppUser {
  const AppUser({
    required this.id,
    required this.email,
    this.firstName,
    this.lastName,
    this.role = 'customer',
    this.profilePic,
    this.phone,
  });

  final String id;
  final String email;
  final String? firstName;
  final String? lastName;
  final String role;
  final String? profilePic;
  final String? phone;

  String get displayName {
    final name = [firstName, lastName].where((s) => (s ?? '').isNotEmpty).join(' ');
    return name.isNotEmpty ? name : email.split('@').first;
  }

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: '${json['id'] ?? json['_id'] ?? ''}',
      email: json['email']?.toString() ?? '',
      firstName: json['first_name']?.toString() ?? json['firstName']?.toString(),
      lastName: json['last_name']?.toString() ?? json['lastName']?.toString(),
      role: json['role']?.toString() ?? 'customer',
      profilePic: json['profile_pic']?.toString() ?? json['profilePic']?.toString(),
      phone: json['phone']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'first_name': firstName,
        'last_name': lastName,
        'role': role,
        'profile_pic': profilePic,
        'phone': phone,
      };
}
