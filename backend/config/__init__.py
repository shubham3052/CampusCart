# Ensure PyMySQL is registered as MySQLdb driver fallback if needed
try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    pass
