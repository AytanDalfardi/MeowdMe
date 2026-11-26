# انتشار meowd me روی GitHub

این راهنما برای مخزن موجود `AytanDalfardi/MeowdMe` است. دستورها را در پوشهٔ پروژه اجرا کن. فایل‌های مدل داخل `dist` هستند و سایت به مرحلهٔ build یا Git LFS نیاز ندارد.

## ورود به GitHub

اگر حساب هنوز در GitHub CLI ثبت نشده، در مرورگر با حساب `AytanDalfardi` وارد شو.

```sh
gh auth login --hostname github.com --git-protocol https --web
```

اگر این حساب از قبل ثبت شده و چند حساب داری، آن را با `gh auth switch -h github.com -u AytanDalfardi` فعال کن. دستور آخر باید نام حساب موردنظر را چاپ کند.

```sh
gh auth setup-git --hostname github.com
gh api --hostname github.com user --jq .login
```

## ارسال تغییرات

```sh
git remote -v
git status --short
git push -u origin main
```

پیش از پوش، بررسی کن که `origin` به `https://github.com/AytanDalfardi/MeowdMe.git` اشاره کند و تغییرات مدنظر در شاخهٔ `main` ثبت شده باشند.

## فعال کردن سایت

در تنظیمات مخزن، به **Settings → Pages** برو و **Source** را روی **GitHub Actions** بگذار. سپس انتشار اول را دستی اجرا کن.

```sh
gh workflow run pages.yml --ref main --repo AytanDalfardi/MeowdMe
gh run list --workflow pages.yml --limit 3 --repo AytanDalfardi/MeowdMe
```

بعد از موفقیت workflow، نشانی سایت در بخش **Settings → Pages** نمایش داده می‌شود. انتشارهای بعدی با push به `main` اجرا می‌شوند.

بستهٔ جداگانهٔ `meowd-me-site.zip` محتوای آمادهٔ میزبانی را دارد. برای میزبانی روی سرویس دیگر، فایل‌های داخل آن را در ریشهٔ سایت HTTPS قرار بده.

[راهنمای GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
