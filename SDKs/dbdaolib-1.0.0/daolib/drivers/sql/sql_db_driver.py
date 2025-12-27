import sqlalchemy
from typing import Any, Tuple
from daolib.exceptions import SqlDaoException
from sqlalchemy.engine.url import URL
from daolib.drivers.sql.config import AbstractDBDriver, DbConnectionEntry


class SQLDriver(AbstractDBDriver):

    primary_url: URL
    secondary_url: URL
    primary_pool_size: int
    secondary_pool_size: int
    primary_max_overflow: int
    secondary_max_overflow: int
    primary_pool_recycle: int
    secondary_pool_recycle: int
    primary_pool_timeout: int
    secondary_pool_timeout: int

    def __init__(self, primary_obj: DbConnectionEntry, secondary_obj: DbConnectionEntry) -> None:
        self.primary_url = URL(drivername=primary_obj.drivername,
                               username=primary_obj.username,
                               password=primary_obj.password,
                               host=primary_obj.host,
                               port=primary_obj.port,
                               database=primary_obj.database,
                               query=primary_obj.odbc_driver)

        self.secondary_url = URL(drivername=secondary_obj.drivername,
                                 username=secondary_obj.username,
                                 password=secondary_obj.password,
                                 host=secondary_obj.host,
                                 port=secondary_obj.port,
                                 database=secondary_obj.database,
                                 query=secondary_obj.odbc_driver)
        self.write_engine = None
        self.read_engine = None
        self.primary_pool_size = primary_obj.pool_size
        self.secondary_pool_size = secondary_obj.pool_size
        self.primary_max_overflow = primary_obj.max_overflow
        self.secondary_max_overflow = secondary_obj.max_overflow
        self.primary_pool_recycle = primary_obj.pool_recycle
        self.secondary_pool_recycle = secondary_obj.pool_recycle
        self.primary_pool_timeout = primary_obj.pool_timeout
        self.secondary_pool_timeout = secondary_obj.pool_timeout

    def connect(self) -> Tuple[Any, Any]:
        try:
            self._disconnect()
            print(f"Connecting Engine to SQL database... P: {self.primary_url}, S: {self.secondary_url}")
            self.write_engine = sqlalchemy.create_engine(
                self.primary_url,
                pool_size=self.primary_pool_size,
                max_overflow=self.primary_max_overflow,
                pool_recycle=self.primary_pool_recycle,
                pool_timeout=self.primary_pool_timeout,
                pool_pre_ping=True
            )
            if self.secondary_url:
                self.read_engine = sqlalchemy.create_engine(
                    self.secondary_url,
                    pool_size=self.secondary_pool_size,
                    max_overflow=self.secondary_max_overflow,
                    pool_recycle=self.secondary_pool_recycle,
                    pool_timeout=self.secondary_pool_timeout,
                    pool_pre_ping=True
                )
            return self.write_engine, self.read_engine
        except Exception as e:
            # Catch specific SQLAlchemy errors if needed, re-raise as SqlDaoException
            raise SqlDaoException(err_code=50010, msg=f'Error connecting with sql db!: {e}')

    def disconnect(self) -> None:
        print("Disconnecting Engine from SQL database...")
        self._disconnect()

    def _disconnect(self) -> None:
        if self.write_engine:
            self.write_engine.dispose()
        if self.read_engine:
            self.read_engine.dispose()

    @property
    def database_url(self) -> str:
        return str(self.primary_url)

    @property
    def version(self) -> str:
        try:
            # Assuming sqlalchemy is imported
            with sqlalchemy.create_engine(self.primary_url).connect() as conn:
                result = conn.execute(sqlalchemy.text("SELECT @@VERSION"))
                return str(result.scalar())
        except Exception:
            return ""