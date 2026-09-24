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
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth_register'),
    path('login/', LoginView.as_view(), name='auth_login'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', CurrentUserView.as_view(), name='auth_me'),
    path('logout/', LogoutView.as_view(), name='auth_logout'),

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

    # Account Deletion via Email OTP (Step 26A / Step 8)
    path('account-deletion/request-otp/', RequestAccountDeletionOTPView.as_view(), name='auth_account_deletion_request_otp'),
    path('account-deletion/confirm/', ConfirmAccountDeletionView.as_view(), name='auth_account_deletion_confirm'),
]
