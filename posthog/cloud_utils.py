from typing import Optional

from django.conf import settings
from django.db.utils import ProgrammingError
from sentry_sdk import capture_exception

is_cloud_cached: Optional[bool] = True

# NOTE: This is cached for the lifetime of the instance but this is not an issue as the value is not expected to change
def is_cloud():
    global is_cloud_cached

    return is_cloud_cached


# NOTE: This is purely for testing purposes
def TEST_clear_cloud_cache():
    global is_cloud_cached
    is_cloud_cached = None
