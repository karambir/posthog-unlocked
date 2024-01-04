from django.core.management.base import BaseCommand

from posthog.models import User


class Command(BaseCommand):
    help = "Create Staff User"

    def add_arguments(self, parser):
        parser.add_argument("--first-name", type=str, help="User First Name", required=True)
        parser.add_argument("--email", type=str, help="User Email", required=True)
        parser.add_argument("--password", type=str, help="User Password", required=True)
        parser.add_argument("--org-name", type=str, help="Organization Name", required=True)

    def handle(self, *args, **kwargs):
        first_name = kwargs["first_name"]
        email = kwargs["email"]
        password = kwargs["password"]
        org_name = kwargs["org_name"]

        organization, team, user = User.objects.bootstrap(
            organization_name=org_name, email=email, password=password, first_name=first_name, is_staff=True,
        )
        organization.setup_section_2_completed = False
        organization.save()
        if user:
            self.stdout.write(self.style.SUCCESS('Staff User "%s" Created!' % first_name))
