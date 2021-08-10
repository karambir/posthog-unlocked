# Generated by Django 3.1.12 on 2021-08-05 12:24

import django.contrib.postgres.fields
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("posthog", "0162_organization_is_member_join_email_enabled"),
    ]

    operations = [
        migrations.AddField(model_name="dashboarditem", name="favorited", field=models.BooleanField(default=False),),
        migrations.AddField(
            model_name="dashboarditem",
            name="tags",
            field=django.contrib.postgres.fields.ArrayField(
                base_field=models.CharField(max_length=32), blank=True, default=list, size=None
            ),
        ),
        migrations.AddField(model_name="dashboarditem", name="updated_at", field=models.DateTimeField(auto_now=True),),
    ]
