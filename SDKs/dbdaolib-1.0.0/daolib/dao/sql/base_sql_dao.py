from typing import Any, List, Optional, Tuple
from sqlalchemy import text
from sqlalchemy.engine import Connection, CursorResult
from pandas import DataFrame, read_sql
from sqlalchemy.exc import IntegrityError, OperationalError, DataError, ProgrammingError, SQLAlchemyError
from daolib.drivers.sql.dao_interface import BaseDAOInterface
from daolib.drivers.sql.connector import Connector
from daolib.exceptions import SqlDaoException
from daolib.constants import DaoErrorCode


class BaseHelperSqlDao(BaseDAOInterface):
    """
    Base DAO for raw SQL execution using SQLAlchemy connections.
    
    Responsibilities:
    - Execute queries using connection.execute(text())
    - Wrap SQLAlchemy exceptions into SqlDaoException
    - Query logging handled by SQLQueryLogger (driver layer)
    - Transaction management handled by @InjectConnection decorator
    
    Usage:
        connector = MyRdbmsConnector()
        dao = MyDao(connector)
        
        @InjectConnection(is_write=True)
        def create_user(self, connection, username):
            query = "INSERT INTO users (username) VALUES (?)"
            return self.insert(connection, query, [username])
    """
    def __init__(self, connector: Connector):
        self.connector = connector

    def _execute_query(
        self,
        connection: Connection,
        query: str,
        params: List[Any]
    ) -> CursorResult:
        """
        Execute DML statement (INSERT, UPDATE, DELETE) using SQLAlchemy connection.
        
        Args:
            connection: SQLAlchemy connection (injected by decorator)
            query: SQL query with ? placeholders
            params: List of parameter values
        
        Returns:
            CursorResult with rowcount and other metadata
        
        Note:
            Transaction management handled by @InjectConnection decorator.
            Query logging handled by SQLQueryLogger at driver layer.
        """
        try:
            result = connection.execute(text(query), params)
            return result
        except IntegrityError as e:
            raise SqlDaoException(DaoErrorCode.INTEGRITY_ERROR, f"Integrity constraint violation: {e}") from e
        except OperationalError as e:
            raise SqlDaoException(DaoErrorCode.OPERATIONAL_ERROR, f"Database operational error: {e}") from e
        except DataError as e:
            raise SqlDaoException(DaoErrorCode.DATA_ERROR, f"Invalid data type or value: {e}") from e
        except ProgrammingError as e:
            raise SqlDaoException(DaoErrorCode.PROGRAMMING_ERROR, f"SQL syntax or schema error: {e}") from e
        except SQLAlchemyError as e:
            raise SqlDaoException(DaoErrorCode.SQLALCHEMY_ERROR, f"SQLAlchemy error: {e}") from e
        except Exception as e:
            raise SqlDaoException(DaoErrorCode.UNKNOWN_ERROR, f"Unexpected error: {e}") from e

    def _execute_and_retrieve(
        self,
        connection: Connection,
        query: str,
        params: List[Any]
    ) -> List[Any]:
        """
        Execute SELECT query and return all rows.
        
        Args:
            connection: SQLAlchemy connection (injected by decorator)
            query: SQL SELECT query with ? placeholders
            params: List of parameter values
        
        Returns:
            List of Row objects (tuple-like, can access by index or column name)
        
        Note:
            Query logging handled by SQLQueryLogger at driver layer.
        """
        try:
            result = connection.execute(text(query), params)
            return result.fetchall()
        except IntegrityError as e:
            raise SqlDaoException(DaoErrorCode.INTEGRITY_SELECT, f"Integrity error during SELECT: {e}") from e
        except OperationalError as e:
            raise SqlDaoException(DaoErrorCode.OPERATIONAL_SELECT, f"Operational error during SELECT: {e}") from e
        except DataError as e:
            raise SqlDaoException(DaoErrorCode.DATA_SELECT, f"Data error during SELECT: {e}") from e
        except ProgrammingError as e:
            raise SqlDaoException(DaoErrorCode.PROGRAMMING_SELECT, f"Programming error during SELECT: {e}") from e
        except SQLAlchemyError as e:
            raise SqlDaoException(DaoErrorCode.SQLALCHEMY_ERROR, f"SQLAlchemy error: {e}") from e
        except Exception as e:
            raise SqlDaoException(DaoErrorCode.UNKNOWN_ERROR, f"Unexpected error: {e}") from e

    def read(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> List[Any]:
        """Execute SELECT query and return all rows."""
        return self._execute_and_retrieve(connection, query, params)

    def insert(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> CursorResult:
        """Execute INSERT query and return result with rowcount/lastrowid."""
        return self._execute_query(connection, query, params)

    def insert_and_retrieve_data(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> List[Any]:
        """Execute INSERT with RETURNING clause and fetch rows."""
        return self._execute_and_retrieve(connection, query, params)

    def update(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> CursorResult:
        """Execute UPDATE query and return result with rowcount."""
        return self._execute_query(connection, query, params)

    def delete(
        self,
        connection: Connection,
        query: str,
        params: List[Any]) -> CursorResult:
        """Execute DELETE query and return result with rowcount."""
        return self._execute_query(connection, query, params)

    @staticmethod
    def _read_from_pandas(connection: Connection, query: str, params: Optional[List[Any]] = None) -> DataFrame:
        """Execute query and return results as pandas DataFrame."""
        params = params or []
        try:
            return read_sql(sql=query, con=connection.connection, params=params)
        except Exception as e:
            raise SqlDaoException(err_code=DaoErrorCode.UNKNOWN_ERROR, msg=f"Pandas read error: {e}")

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

