from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .auth_views import (
    RegisterView,
    LoginView,
    CurrentUserView,
    LogoutView,
    SendEmailOTPView,
    VerifyEmailOTPView,
    ResendEmailOTPView,
    RequestPasswordResetView,
    VerifyPasswordResetOTPView,
    ConfirmPasswordResetView,
    RequestEmailChangeView,
    ConfirmEmailChangeView,
    RequestAccountDeletionOTPView,
    ConfirmAccountDeletionView,
    SwitchRoleView,
    VerifyOwner2FAView,
    ResendOwner2FAView,
    VerifyOwnerTOTPView,
    OwnerPasswordSetupRequestView,
    OwnerPasswordSetupVerifyEmailView,
    OwnerPasswordSetupResendEmailView,
    OwnerPasswordSetupVerifyTOTPView,
    OwnerPasswordSetupCompleteView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth_register'),
    path('login/', LoginView.as_view(), name='auth_login'),
    path('switch-role/', SwitchRoleView.as_view(), name='auth_switch_role'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', CurrentUserView.as_view(), name='auth_me'),
    path('logout/', LogoutView.as_view(), name='auth_logout'),

    # Platform Owner Mandatory 2FA Endpoints (Step 17 & Step 18)
    path('owner/verify-2fa/', VerifyOwner2FAView.as_view(), name='auth_owner_verify_2fa'),
    path('owner/resend-2fa/', ResendOwner2FAView.as_view(), name='auth_owner_resend_2fa'),
    path('owner/verify-totp/', VerifyOwnerTOTPView.as_view(), name='auth_owner_verify_totp'),

    # Platform Owner Secure Initial Password Setup (Step 19)
    path('owner/password-setup/request/', OwnerPasswordSetupRequestView.as_view(), name='auth_owner_password_setup_request'),
    path('owner/password-setup/verify-email/', OwnerPasswordSetupVerifyEmailView.as_view(), name='auth_owner_password_setup_verify_email'),
    path('owner/password-setup/resend-email/', OwnerPasswordSetupResendEmailView.as_view(), name='auth_owner_password_setup_resend_email'),
    path('owner/password-setup/verify-totp/', OwnerPasswordSetupVerifyTOTPView.as_view(), name='auth_owner_password_setup_verify_totp'),
    path('owner/password-setup/complete/', OwnerPasswordSetupCompleteView.as_view(), name='auth_owner_password_setup_complete'),

    # Email Verification OTP Endpoints (Step 26A)
    path('email/send-otp/', SendEmailOTPView.as_view(), name='auth_email_send_otp'),
    path('email/verify-otp/', VerifyEmailOTPView.as_view(), name='auth_email_verify_otp'),
    path('email/resend-otp/', ResendEmailOTPView.as_view(), name='auth_email_resend_otp'),
    path('email/change/request/', RequestEmailChangeView.as_view(), name='auth_email_change_request'),
    path('email/change/confirm/', ConfirmEmailChangeView.as_view(), name='auth_email_change_confirm'),

    # Password Reset via Email OTP (Step 26A)
    path('password-reset/request/', RequestPasswordResetView.as_view(), name='auth_password_reset_request'),
    path('password-reset/verify/', VerifyPasswordResetOTPView.as_view(), name='auth_password_reset_verify'),
    path('password-reset/confirm/', ConfirmPasswordResetView.as_view(), name='auth_password_reset_confirm'),
    # Support alternate URL format
    path('password/reset/request/', RequestPasswordResetView.as_view(), name='auth_password_reset_request_alt'),
    path('password/reset/confirm/', ConfirmPasswordResetView.as_view(), name='auth_password_reset_confirm_alt'),

    # Account Deletion via Email OTP (Step 26A / Step 8)
    path('account-deletion/request-otp/', RequestAccountDeletionOTPView.as_view(), name='auth_account_deletion_request_otp'),
    path('account-deletion/confirm/', ConfirmAccountDeletionView.as_view(), name='auth_account_deletion_confirm'),
]
