process.env.NODE_ENV = 'test';

function getPasswordsForRole(role, origin, email = '') {
  const emailPrefix = email ? email.split('@')[0].toLowerCase() : '';
  const valid = new Set();

  if (emailPrefix) {
    valid.add(`${emailPrefix}123`);
    valid.add(`${emailPrefix.replace(/[._]/g, '')}123`);
  }

  if (role === 'faculty' && origin === 'IDS') {
    valid.add('ids.faculty123');
    valid.add('idsfaculty123');
    valid.add('faculty123');
  } else if (role === 'ids_principal') {
    valid.add('ids.principal123');
    valid.add('ids_principal123');
    valid.add('idsprincipal123');
    valid.add('principal123');
  } else if (role) {
    valid.add(`${role}123`);
  }

  const list = Array.from(valid);
  return {
    primary: list[0] || 'student123',
    validSet: valid,
  };
}

module.exports = { getPasswordsForRole };
