from django.urls import path
from .admin_management_views import (
    AdminManagementListView,
    AdminInviteView,
    AdminResendInvitationOTPView,
    AdminVerifyInvitationOTPView,
    AdminSetPasswordView,
    AdminToggleStatusView,
)

urlpatterns = [
    # Primary Admin Management Endpoints
    path('management/admins/', AdminManagementListView.as_view(), name='admin_management_list'),
    path('management/invite/', AdminInviteView.as_view(), name='admin_management_invite'),
    path('management/invitations/resend/', AdminResendInvitationOTPView.as_view(), name='admin_management_invitation_resend'),
    path('management/invitations/verify/', AdminVerifyInvitationOTPView.as_view(), name='admin_management_invitation_verify'),
    path('management/invitations/set-password/', AdminSetPasswordView.as_view(), name='admin_management_set_password'),
    path('management/admins/<int:admin_id>/toggle-status/', AdminToggleStatusView.as_view(), name='admin_management_toggle_status'),

    # RESTful Convention Aliases (Section 18 of specification)
    path('invitations/', AdminInviteView.as_view(), name='admin_invitations_create'),
    path('invitations/verify/', AdminVerifyInvitationOTPView.as_view(), name='admin_invitations_verify'),
    path('invitations/set-password/', AdminSetPasswordView.as_view(), name='admin_invitations_set_password'),
    path('invitations/resend/', AdminResendInvitationOTPView.as_view(), name='admin_invitations_resend'),
    path('users/', AdminManagementListView.as_view(), name='admin_users_list'),
    path('users/<int:admin_id>/status/', AdminToggleStatusView.as_view(), name='admin_user_status_patch'),
    path('users/<int:admin_id>/toggle-status/', AdminToggleStatusView.as_view(), name='admin_user_toggle_status'),
]
