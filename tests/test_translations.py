import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # noqa: E402
from botlib.translations import tr  # noqa: E402


def test_tr_welcome_farsi():
    assert tr('welcome', 'fa').startswith('به بات')


def test_tr_product_not_found():
    assert tr('product_not_found', 'fa') == 'محصول یافت نشد'


def test_tr_default_english():
    assert tr('welcome', 'en') == 'Welcome! Use /products to list products.'


def test_tr_unauthorized():
    assert tr('unauthorized', 'en') == 'Unauthorized'
    assert tr('unauthorized', 'fa') == 'اجازه دسترسی ندارید'


def test_tr_menu_admin():
    assert tr('menu_admin', 'en') == 'Admin'
    assert tr('menu_admin', 'fa') == 'مدیریت'


def test_tr_menu_main():
    assert tr('menu_main', 'en') == 'Main menu'
    assert tr('menu_main', 'fa') == 'منوی اصلی'


def test_tr_back_button():
    assert tr('back_button', 'en') == 'Back'
    assert tr('back_button', 'fa') == 'بازگشت'


def test_tr_code_button():
    assert tr('code_button', 'en') == 'Get code'
    assert tr('code_button', 'fa') == 'دریافت کد'


def test_tr_use_code_button():
    assert 'Press the button' in tr('use_code_button', 'en')
    assert tr('use_code_button', 'fa').startswith('برای دریافت')


def test_tr_edit_flow_strings():
    assert tr('select_product_edit', 'en') == 'Select a product to edit:'
    assert tr('select_product_edit', 'fa') == 'محصول مورد نظر برای ویرایش را انتخاب کنید:'
    assert tr('select_field_edit', 'en') == 'Select a field to edit:'
    assert tr('select_field_edit', 'fa') == 'فیلد مورد نظر برای ویرایش را انتخاب کنید:'
    assert tr('enter_new_value', 'en') == 'Enter new value:'
    assert tr('enter_new_value', 'fa') == 'مقدار جدید را وارد کنید:'


def test_tr_new_menu_strings():
    assert tr('menu_buyers', 'en') == 'Buyers'
    assert tr('menu_clearbuyers', 'fa') == 'پاک‌سازی خریداران'
    assert tr('delete_button', 'en') == 'Delete'
    assert tr('select_product_stats', 'en').startswith('Select a product')


def test_tr_menu_resend():
    assert tr('menu_resend', 'en') == 'Resend credentials'
    assert tr('menu_resend', 'fa') == 'ارسال مجدد اطلاعات'


def test_tr_delete_strings():
    assert tr('select_product_delete', 'en').startswith('Select a product')
    assert tr('confirm_delete', 'fa').startswith('حذف')
