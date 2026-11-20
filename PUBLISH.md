# انتشار meowd me روی GitHub

دستورها برای ساخت یک مخزن عمومی جدید به نام `AytanDalfardi/meowd-me` هستند. در پوشهٔ پروژه یا پوشه‌ای که از بستهٔ GitHub استخراج کرده‌ای اجرا کن. فایل‌های مدل داخل `dist` هستند و سایت به مرحلهٔ build یا Git LFS نیاز ندارد.

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

## ساخت و ارسال مخزن

```sh
git init -b main
git add .gitignore .github README.md PUBLISH.md dist
git commit -m "Publish meowd me"
gh repo create AytanDalfardi/meowd-me --public --source=. --remote=origin --push
```

اگر Git موقع commit نام یا ایمیل خواست، نام و ایمیل تأییدشده یا نشانی noreply حسابت را با `git config user.name` و `git config user.email` برای همین مخزن تنظیم کن و commit را دوباره اجرا کن.

## فعال کردن سایت

در تنظیمات مخزن، به **Settings → Pages** برو و **Source** را روی **GitHub Actions** بگذار. سپس انتشار اول را دستی اجرا کن.

```sh
gh workflow run pages.yml --ref main --repo AytanDalfardi/meowd-me
gh run list --workflow pages.yml --limit 3 --repo AytanDalfardi/meowd-me
```

پس از سبز شدن اجرای workflow، نشانی مورد انتظار سایت [aytandalfardi.github.io/meowd-me](https://aytandalfardi.github.io/meowd-me/) است. انتشارهای بعدی با push به `main` اجرا می‌شوند.

بستهٔ جداگانهٔ `meowd-me-site.zip` محتوای آمادهٔ میزبانی را دارد. برای میزبانی روی سرویس دیگر، فایل‌های داخل آن را در ریشهٔ سایت HTTPS قرار بده.

[راهنمای GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) · [راهنمای GitHub CLI](https://cli.github.com/manual/gh_repo_create)
