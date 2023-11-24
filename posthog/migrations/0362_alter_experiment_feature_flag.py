# Generated by Django 3.2.19 on 2023-11-10 11:44

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("posthog", "0361_add_plugin_config_ui_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="experiment",
            name="feature_flag",
            field=models.ForeignKey(on_delete=django.db.models.deletion.RESTRICT, to="posthog.featureflag"),
        ),
    ]
