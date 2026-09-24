import sys
import time
import socket
import smtplib
from django.core.management.base import BaseCommand
from django.core.mail import EmailMultiAlternatives, get_connection
from django.conf import settings


class Command(BaseCommand):
    help = (
        "Safely tests Django Gmail SMTP email delivery to a specified recipient without exposing credentials.\n"
        "Usage: python manage.py test_gmail_smtp <recipient_email>"
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'recipient',
            type=str,
            help="Recipient email address to receive the test verification email"
        )
        parser.add_argument(
            '--subject',
            type=str,
            default="CampusCart - Gmail SMTP Email Delivery Test",
            help="Optional custom email subject"
        )

    def handle(self, *args, **options):
        recipient = options['recipient'].strip()
        subject = options['subject'].strip()

        self.stdout.write("=" * 70)
        self.stdout.write(self.style.MIGRATE_HEADING("CAMPUSCART GMAIL SMTP DIAGNOSTIC DELIVERY TEST"))
        self.stdout.write("=" * 70)

        # 1. Audit Configuration
        host = getattr(settings, 'EMAIL_HOST', 'smtp.gmail.com')
        port = getattr(settings, 'EMAIL_PORT', 587)
        use_tls = getattr(settings, 'EMAIL_USE_TLS', True)
        sender_user = getattr(settings, 'EMAIL_HOST_USER', '')
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', sender_user or 'garibhokya@gmail.com')
        has_password = bool(getattr(settings, 'EMAIL_HOST_PASSWORD', ''))

        self.stdout.write(f"  SMTP Server:    {host}:{port}")
        self.stdout.write(f"  Use TLS:        {use_tls}")
        self.stdout.write(f"  Sender User:    {sender_user if sender_user else '[NOT SET]'}")
        self.stdout.write(f"  From Email:     {from_email}")
        self.stdout.write(f"  App Password:   {'[CONFIGURED - HIDDEN]' if has_password else self.style.ERROR('[MISSING IN .env]')}")
        self.stdout.write(f"  Test Recipient: {recipient}")
        self.stdout.write("-" * 70)

        if not sender_user:
            self.stdout.write(self.style.ERROR(
                "[ERROR] EMAIL_HOST_USER is not configured in backend/.env.\n"
                "Please set EMAIL_HOST_USER=garibhokya@gmail.com in backend/.env."
            ))
            sys.exit(1)

        if not has_password:
            self.stdout.write(self.style.ERROR(
                "[ERROR] EMAIL_HOST_PASSWORD is empty in backend/.env.\n"
                "To deliver real emails through Gmail, generate a 16-character App Password at:\n"
                "https://myaccount.google.com/apppasswords\n"
                "and paste it into backend/.env (EMAIL_HOST_PASSWORD=xxxx xxxx xxxx xxxx without spaces)."
            ))
            sys.exit(1)

        # 2. Prepare Email
        text_body = (
            f"Hello,\n\n"
            f"This is an automated test message from the Smart Student Stationery Delivery System (CampusCart).\n\n"
            f"If you are reading this email, Django Gmail SMTP delivery is working perfectly!\n\n"
            f"Details:\n"
            f"  - Sender: {sender_user}\n"
            f"  - Recipient: {recipient}\n"
            f"  - Server: {host}:{port} (TLS: {use_tls})\n\n"
            f"Best regards,\n"
            f"CampusCart Automated Delivery Network"
        )

        html_body = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>{subject}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%); padding: 28px 24px; text-align: center; color: #ffffff; }}
    .brand-title {{ margin: 0; font-size: 24px; font-weight: 800; }}
    .body {{ padding: 28px 24px; }}
    .badge {{ display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 6px 12px; border-radius: 9999px; font-weight: 700; font-size: 13px; margin-bottom: 16px; }}
    .footer {{ background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="brand-title">CampusCart</h1>
      <p style="margin: 4px 0 0; opacity: 0.9; font-size: 13px;">Gmail SMTP Test Verification</p>
    </div>
    <div class="body">
      <div class="badge">&#10003; SMTP Delivery Confirmed</div>
      <p>Hello,</p>
      <p>This is a safe diagnostic test sent from <strong>CampusCart</strong> via <strong>Gmail SMTP</strong> (<code>{host}:{port}</code>).</p>
      <p>Real verification emails (Registration 6-digit OTP, Password Reset, and Account Deletion) are now ready to be delivered directly to student inboxes!</p>
    </div>
    <div class="footer">
      &copy; 2026 CampusCart &bull; Smart Student Stationery &amp; Xerox Delivery
    </div>
  </div>
</body>
</html>"""

        self.stdout.write(f"Connecting to {host}:{port} via SMTP with TLS...")
        start_time = time.time()

        try:
            connection = get_connection(
                backend='django.core.mail.backends.smtp.EmailBackend',
                host=host,
                port=port,
                username=sender_user,
                password=getattr(settings, 'EMAIL_HOST_PASSWORD', ''),
                use_tls=use_tls,
                timeout=getattr(settings, 'EMAIL_TIMEOUT', 15)
            )

            msg = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=from_email,
                to=[recipient],
                connection=connection
            )
            msg.attach_alternative(html_body, "text/html")
            msg.send(fail_silently=False)

            elapsed = round((time.time() - start_time) * 1000, 2)
            self.stdout.write("-" * 70)
            self.stdout.write(self.style.SUCCESS(
                f"[SUCCESS] Test email successfully delivered via Gmail SMTP in {elapsed}ms!"
            ))
            self.stdout.write(f"  Sender:    {from_email}")
            self.stdout.write(f"  Recipient: {recipient}")
            self.stdout.write(f"  Message:   Check the recipient inbox (and spam folder if first time).")
            self.stdout.write("=" * 70)

        except smtplib.SMTPAuthenticationError as e:
            self.stdout.write("-" * 70)
            self.stdout.write(self.style.ERROR(
                "[ERROR] Gmail SMTP Authentication Failed (535 5.7.8 Username and Password not accepted).\n"
                "Diagnostics:\n"
                "1. Confirm 2-Step Verification is turned ON in your Google Account: https://myaccount.google.com/security\n"
                "2. Generate an App Password (do NOT use your standard Gmail password): https://myaccount.google.com/apppasswords\n"
                "3. Ensure the 16-character code in backend/.env has no extra spaces.\n"
                "4. Verify EMAIL_HOST_USER matches the Google account: garibhokya@gmail.com"
            ))
            sys.exit(1)

        except (smtplib.SMTPConnectError, socket.timeout, ConnectionRefusedError, OSError) as e:
            self.stdout.write("-" * 70)
            self.stdout.write(self.style.ERROR(
                f"[ERROR] Could not connect to Gmail SMTP server ({host}:{port}): {type(e).__name__} - {e}\n"
                "Diagnostics:\n"
                "1. Verify internet connectivity.\n"
                "2. Check if outbound traffic on port 587 is allowed by your network/firewall."
            ))
            sys.exit(1)

        except smtplib.SMTPRecipientsRefused as e:
            self.stdout.write("-" * 70)
            self.stdout.write(self.style.ERROR(
                f"[ERROR] Recipient address rejected by Gmail: {recipient}\n"
                "Please verify the recipient email address."
            ))
            sys.exit(1)

        except Exception as e:
            self.stdout.write("-" * 70)
            self.stdout.write(self.style.ERROR(
                f"[ERROR] Unexpected error sending email: {type(e).__name__}: {e}"
            ))
            sys.exit(1)
