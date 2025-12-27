from typing import Any, List, Optional, Tuple, Sequence
from sqlalchemy.engine import Connection, CursorResult
from pandas import DataFrame, read_sql
from sqlalchemy.exc import IntegrityError, OperationalError, DataError, ProgrammingError, SQLAlchemyError
from daolib.drivers.dao_interface import BaseDAOInterface
from daolib.exceptions import SqlDaoException
from daolib.logger import AbstractLogger


class BaseHelperSqlDao(BaseDAOInterface):
    """
    “Helper” that encapsulates raw‐SQL execution logic, given a Connection.
    Callers (e.g. a DAO) must pass a live `Connection` into every method.
    Transaction management is handled by a decorator at the service layer.
    """
    def __init__(self, log: Optional[AbstractLogger] = None):
        if log is None:
            raise NotImplementedError("A concrete logger must be provided by the child class.")
        self.log: AbstractLogger = log

    def _execute_query(
        self,
        connection: Connection,
        query: str,
        params: List[Any]
    ) -> Any:
        """
        Executes a DML statement. Transaction begin/commit/rollback
        is handled by the decorator.
        """
        dbapi = connection.connection
        self.log.info(f"[DB] Connection: {connection!r}")
        self.log.info(f"[DB] About to execute DML statement:")
        self.log.info(f"[DB] Query: {query!r}")
        self.log.info(f"[DB] Params: {params!r}")
        before = getattr(dbapi, 'total_changes', 0)
        try:
            cursor = dbapi.cursor()
            self.log.debug("[DB] Executing query...")
            result = cursor.execute(query, params)
            after = getattr(dbapi, 'total_changes', 0)
            rowcount = getattr(cursor, "rowcount", None)
            delta = after - before
            self.log.info(f"[DB] Query executed. rowcount={rowcount}, total_changes delta={delta}")
            if delta > 0:
                self.log.info(f"[DB] DML statement succeeded; {delta} row(s) were affected.")
            else:
                self.log.info("[DB] DML statement executed successfully but did not modify any rows.")
            return result
        except IntegrityError as e:
            self.log.error(f"Integrity error when executing DML {query!r} with parameters {params!r}: {e}")
            raise SqlDaoException(50090, f"Integrity error: {e}") from e
        except OperationalError as e:
            self.log.error(f"Operational error when executing DML {query!r}: {e}")
            raise SqlDaoException(50091, f"Operational error: {e}") from e
        except DataError as e:
            self.log.error(f"Data error when executing DML {query!r}: {e}")
            raise SqlDaoException(50092, f"Data error: {e}") from e
        except ProgrammingError as e:
            self.log.error(f"Programming error when executing DML {query!r}: {e}")
            raise SqlDaoException(50093, f"Programming error: {e}") from e
        except SQLAlchemyError as e:
            self.log.error(f"Unexpected SQLAlchemy error during DML {query!r}: {e}")
            raise SqlDaoException(50094, f"SQLAlchemy error: {e}") from e
        except Exception as e:
            self.log.error(f"Unexpected exception during DML execution: {e}")
            raise SqlDaoException(50099, f"Unexpected error: {e}") from e

    def _execute_and_retrieve(
        self,
        connection: Connection,
        query: str,
        params: List[Any]
    ) -> List[Any]:
        """
        Executes a SELECT and returns all rows. Transaction management is external.
        """
        self.log.info(f"[DB] Connection: {connection!r}")
        self.log.info(f"[DB] About to execute SELECT query:")
        self.log.info(f"[DB] Query: {query!r}")
        self.log.info(f"[DB] Params: {params!r}")
        try:
            cursor = connection.connection.cursor()
            self.log.debug("[DB] Executing query...")
            cursor.execute(query, params)
            rows: Sequence[Any] = cursor.fetchall()
            count = len(rows)
            self.log.info(f"[DB] Query executed. {count} row(s) fetched.")
            if count > 0:
                self.log.info(f"[DB] SELECT query succeeded; fetched {count} row(s).")
            else:
                self.log.info("[DB] SELECT query executed successfully but returned no rows.")
            return list(rows)
        except IntegrityError as e:
            self.log.error(f"Integrity error during SELECT {query!r}: {e}")
            raise SqlDaoException(50095, f"Integrity error: {e}") from e
        except OperationalError as e:
            self.log.error(f"Operational error during SELECT {query!r}: {e}")
            raise SqlDaoException(50096, f"Operational error: {e}") from e
        except DataError as e:
            self.log.error(f"Data error during SELECT {query!r}: {e}")
            raise SqlDaoException(50097, f"Data error: {e}") from e
        except ProgrammingError as e:
            self.log.error(f"Programming error during SELECT {query!r}: {e}")
            raise SqlDaoException(50098, f"Programming error: {e}") from e
        except SQLAlchemyError as e:
            self.log.error(f"Unexpected SQLAlchemy error during SELECT {query!r}: {e}")
            raise SqlDaoException(50099, f"SQLAlchemy error: {e}") from e
        except Exception as e:
            self.log.error(f"Unexpected exception during SELECT execution: {e}")
            raise SqlDaoException(50099, f"Unexpected error: {e}") from e

    def read(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> List[Any]:
        return self._execute_and_retrieve(connection, query, params)

    def insert(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> CursorResult[Any]:
        return self._execute_query(connection, query, params)

    def insert_and_retrieve_data(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> List[Any]:
        return self._execute_and_retrieve(connection, query, params)

    def update(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> CursorResult[Any]:
        return self._execute_query(connection, query, params)

    def delete(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> CursorResult[Any]:
        return self._execute_query(connection, query, params)

    @staticmethod
    def _read_from_pandas(connection: Connection, query: str, params: Optional[List[Any]] = None) -> DataFrame:
        params = params or []
        try:
            return read_sql(sql=query, con=connection.connection, params=params)
        except Exception as e:
            raise SqlDaoException(err_code=50099, msg=f"{e}")

    @staticmethod
    def _placeholder_replacement(num: int) -> str:
        return f"({', '.join(['?' for _ in range(num)])})"

    @staticmethod
    def map_insert_values_from_df(df: DataFrame) -> str:
        return str([tuple([df.loc[i, col] for col in df.columns]) for i in range(len(df))])[1:-1]
    
    @staticmethod
    def df_placeholders_mapping(df: DataFrame) -> Tuple[str, List[Any]]:
        placeholders = ", ".join(["?" for _ in range(len(df.columns))])
        values_placeholders = ", ".join([f"({placeholders})" for _ in range(len(df))])
        params: List[Any] = [item for sublist in df.to_dict('records') for item in sublist.values()]
        return values_placeholders, params

