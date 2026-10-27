"""Original files: MinIO (S3-compatible) on the VPS, a local folder when no endpoint is configured."""

import io
from functools import lru_cache
from pathlib import Path

from backend.config import settings


@lru_cache
def _minio():
    from minio import Minio

    s = settings()
    client = Minio(s.s3_endpoint, access_key=s.s3_access_key, secret_key=s.s3_secret_key, secure=s.s3_secure)
    if not client.bucket_exists(s.s3_bucket):
        client.make_bucket(s.s3_bucket)
    return client


def put(key: str, data: bytes, mime: str) -> None:
    s = settings()
    if s.s3_endpoint:
        _minio().put_object(s.s3_bucket, key, io.BytesIO(data), len(data), content_type=mime)
    else:
        path = Path(s.local_storage_dir) / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


def get(key: str) -> bytes:
    s = settings()
    if s.s3_endpoint:
        resp = _minio().get_object(s.s3_bucket, key)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()
    return (Path(s.local_storage_dir) / key).read_bytes()


def healthy() -> bool:
    s = settings()
    if not s.s3_endpoint:
        return Path(s.local_storage_dir).parent.exists()
    try:
        return _minio().bucket_exists(s.s3_bucket)
    except Exception:
        return False
