# Overridden in posthog-cloud

import sys

import structlog

from posthog.settings.utils import get_from_env, str_to_bool

logger = structlog.get_logger(__name__)


MULTI_TENANCY = True
