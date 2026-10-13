from rest_framework_simplejwt.authentication import JWTAuthentication

class MultiRoleJWTAuthentication(JWTAuthentication):
    """
    Enhanced JWT Authentication for Multi-Role Support.
    Extracts the cryptographically signed `active_role` claim from the validated token
    and dynamically sets `request.user.active_role = active_role` if the user is authorized.
    """
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if user is not None:
            active_role = validated_token.get('active_role')
            if active_role and user.has_role(active_role):
                user.active_role = active_role
            elif hasattr(user, 'roles') and user.roles:
                user.active_role = user.roles[0]
            elif hasattr(user, 'role') and user.role:
                user.active_role = user.role
        return user
