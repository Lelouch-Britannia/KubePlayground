from typing import Tuple

from daolib.dao.sql.base_sql_dao import BaseHelperSqlDao
from daolib.drivers.abstract_db_driver import DbConnectionEntry


class BaseConfigSqlDao(BaseHelperSqlDao):
    """This is how you need to inherit create this class via inheritance"""
    def read_and_load_configs(self) -> Tuple[DbConnectionEntry, DbConnectionEntry]:
        """ You would like to override this method! """
        # load config file here
        # passing dummy values below

        read_user = "<username>"
        read_password = "<pwd>"  # read from k8s secret or os.environ
        read_host = "<host>"
        read_db = "<db_name>"
        read_port = 1433
        read_pool = 1

        write_db = "<db_name>"
        write_user = "<username>"
        write_password = "<pwd>"
        write_host = "<host>"
        write_port = 1433
        write_pool = 1
        driver_name = "mssql+pyodbc"

        primary_obj = DbConnectionEntry(drivername=driver_name, username=write_user, password=write_password,
                                        host=write_host, database=write_db, pool_size=write_pool, port=int(write_port))
        secondary_obj = DbConnectionEntry(drivername=driver_name, username=read_user, password=read_password,
                                          host=read_host, database=read_db, pool_size=read_pool, port=int(read_port))
        return primary_obj, secondary_obj
