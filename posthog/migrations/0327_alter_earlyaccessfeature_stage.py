# Generated by Django 3.2.18 on 2023-06-12 19:31

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("posthog", "0326_team_extra_settings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="earlyaccessfeature",
            name="stage",
            field=models.CharField(
                choices=[
                    ("draft", "draft"),
                    ("concept", "concept"),
                    ("alpha", "alpha"),
                    ("beta", "beta"),
                    ("general-availability", "general availability"),
                    ("archived", "archived"),
                ],
                max_length=40,
            ),
        ),
    ]
